import type { DealStage, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getProjectsList } from "@/lib/reads/projects";
import { getMyTasks, getTaskDetail, getAvailableTasks } from "@/lib/reads/tasks";
import { getPayrollDashboard } from "@/lib/reads/payroll";
import { getPipeline } from "@/lib/reads/recruitment";
import { createProject, updateProject } from "@/lib/actions/projects";
import { createTask, updateTaskStatus, reassignTask, claimTask, resolveClaim, updateTask } from "@/lib/actions/tasks";
import { addTaskComment } from "@/lib/actions/comments";
import { createDeal, convertDealToClient, DEAL_STAGES } from "@/lib/sales/deal";
import { sendClientAgreement } from "@/lib/sales/agreement";
import { viewForRole } from "@/lib/auth/roles";
import { canUserActOnTask } from "@/lib/services/tasks";
import { filterProjectsByClientOrg, taskClientOrgWhere } from "./scoping";
import { visibleTools, isAllAccess, type McpActor } from "./access";
import { MCP_TOOLS } from "./protocol";

export type McpCtx = McpActor;

/** Base URL for links returned to the AI client (prod domain fallback). */
const BASE_URL = env.APP_BASE_URL ?? env.NEXTAUTH_URL ?? "https://team.purewaterautomations.com";

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

function bool(args: Record<string, unknown>, key: string): boolean | undefined {
  return typeof args[key] === "boolean" ? (args[key] as boolean) : undefined;
}

/** Resolve a project reference (id or name) to a project id. */
async function resolveProjectId(ref: string): Promise<string | null> {
  const byId = await db.project.findUnique({ where: { id: ref }, select: { id: true } });
  if (byId) return byId.id;
  const byName = await db.project.findFirst({
    where: { name: { equals: ref, mode: "insensitive" } },
    select: { id: true },
  });
  if (byName) return byName.id;
  const byContains = await db.project.findFirst({
    where: { name: { contains: ref, mode: "insensitive" } },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  return byContains?.id ?? null;
}

/** Resolve an assignee reference (email or name) to a user id. */
async function resolveAssigneeId(ref: string): Promise<string | null> {
  const byEmail = await db.user.findFirst({ where: { email: { equals: ref, mode: "insensitive" } }, select: { id: true } });
  if (byEmail) return byEmail.id;
  const byName = await db.user.findFirst({
    where: { name: { contains: ref, mode: "insensitive" }, active: true },
    select: { id: true },
  });
  return byName?.id ?? null;
}

const VALID_STATUS = new Set(["NotStarted", "InProgress", "Done", "Blocked"]);
const PROJECT_STATUS = new Set(["Planning", "Active", "Done", "Paused"]);
const PROJECT_TYPE = new Set(["Project", "Event", "Recurring", "Report"]);
const PRIORITY = new Set(["Low", "Medium", "High"]);
const TASK_STRATEGY = new Set(["Create", "Research", "Automate", "Communicate", "Plan", "Delegate"]);

/**
 * Read + validate an optional enum arg. Returns {value} (possibly undefined) when
 * ok, or {error} with a clean message when the caller passed an invalid value —
 * so bad input becomes a tool error, not a Prisma 500.
 */
function enumArg(args: Record<string, unknown>, key: string, allowed: Set<string>): { value?: string; error?: string } {
  const v = str(args, key);
  if (v === undefined) return {};
  if (!allowed.has(v)) return { error: `Invalid ${key} "${v}" — must be one of: ${[...allowed].join(", ")}` };
  return { value: v };
}

type TaskRow = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: string | null;
  dueDate: Date | null;
  client?: string | null;
  assignedTo?: { name: string | null; email: string } | null;
  project?: { name: string } | null;
};

function taskSummary(t: TaskRow) {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
    client: t.client ?? null,
    assignee: t.assignedTo ? (t.assignedTo.name ?? t.assignedTo.email) : null,
    project: t.project?.name ?? null,
  };
}

export async function executeTool(name: string, args: Record<string, unknown>, ctx: McpCtx): Promise<{ text: string; isError?: boolean }> {
  const json = (v: unknown) => ({ text: JSON.stringify(v, null, 2) });
  const fail = (msg: string) => ({ text: msg, isError: true });
  const isManager = isAllAccess(ctx) || ctx.canDelegate;

  switch (name) {
    // ── Everyone ────────────────────────────────────────────────────────────
    case "whoami": {
      return json({
        email: ctx.actorEmail,
        name: ctx.actorName,
        role: ctx.actorRole,
        isAdmin: ctx.isAdmin,
        canDelegateTasks: ctx.canDelegate,
        consoleView: viewForRole(ctx.actorRole),
        tools: visibleTools(MCP_TOOLS, ctx).map((t) => t.name),
        note: "Writes made through this MCP are attributed to you in the console's activity log.",
      });
    }

    case "my_tasks": {
      const status = str(args, "status");
      const tasks = await getMyTasks(ctx.actorId);
      const rows = tasks
        .filter((t) => !status || t.status === status)
        .map((t) => ({ ...taskSummary(t), comments: t.comments.length }));
      return json({ count: rows.length, tasks: rows });
    }

    case "get_task": {
      const taskId = str(args, "taskId");
      if (!taskId) return fail("taskId is required");
      const t = await getTaskDetail(taskId);
      if (!t) return fail(`No task with id "${taskId}"`);
      // Managers/admins can inspect any task; VAs only tasks they're part of (or open-pool ones).
      if (!isManager && !t.claimable && !canUserActOnTask(ctx.actorId, false, t)) {
        return fail("You can only view tasks assigned to you, created by you, or open to claim.");
      }
      return json({
        ...taskSummary(t),
        instructions: t.instructions,
        claimable: t.claimable,
        assignedBy: t.assignedBy?.name ?? null,
        checklist: t.checklist.map((c) => ({ id: c.id, text: c.text, done: c.done })),
        dependencies: t.dependencies.map((d) => ({ id: d.dependsOn.id, title: d.dependsOn.title, status: d.dependsOn.status })),
        comments: t.comments.map((c) => ({ author: c.author.name, body: c.body, at: c.createdAt.toISOString() })),
        url: `${BASE_URL}/${isManager ? "hr" : "va"}/tasks/${t.id}`,
      });
    }

    case "update_task_status": {
      const taskId = str(args, "taskId");
      const status = str(args, "status");
      if (!taskId || !status || !VALID_STATUS.has(status)) return fail("taskId and a valid status (NotStarted|InProgress|Done|Blocked) are required");
      const updated = await updateTaskStatus(ctx.actorId, ctx.actorRole, taskId, status as TaskStatus);
      return json({ updated: true, id: updated.id, title: updated.title, status: updated.status });
    }

    case "add_task_comment": {
      const taskId = str(args, "taskId");
      const body = str(args, "body");
      if (!taskId || !body) return fail("taskId and body are required");
      const comment = await addTaskComment(ctx.actorId, ctx.actorRole, taskId, body);
      return json({ commented: true, taskId, author: comment.author.name, at: comment.createdAt.toISOString() });
    }

    case "list_available_tasks": {
      const tasks = await getAvailableTasks();
      return json({
        count: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          instructions: t.instructions,
          priority: t.priority,
          dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
          client: t.client,
          project: t.project?.name ?? null,
          postedBy: t.assignedBy?.name ?? null,
          pendingClaimBy: t.claimRequestedBy ? (t.claimRequestedBy.name ?? t.claimRequestedBy.email) : null,
        })),
      });
    }

    case "claim_task": {
      const taskId = str(args, "taskId");
      if (!taskId) return fail("taskId is required");
      await claimTask(ctx.actorId, taskId);
      return json({ claimRequested: true, taskId, note: "A manager will approve or deny the claim." });
    }

    case "my_notifications": {
      const unreadOnly = bool(args, "unreadOnly") ?? true;
      const limit = typeof args.limit === "number" ? Math.min(Math.max(1, args.limit), 50) : 20;
      const rows = await db.notification.findMany({
        where: { userId: ctx.actorId, ...(unreadOnly ? { read: false } : {}) },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return json({
        count: rows.length,
        unreadOnly,
        notifications: rows.map((n) => ({ id: n.id, type: n.type, body: n.body, link: n.link ? `${BASE_URL}${n.link}` : null, read: n.read, at: n.createdAt.toISOString() })),
      });
    }

    case "list_projects": {
      const status = str(args, "status");
      const clientOrgId = str(args, "clientOrgId");
      const all = await getProjectsList();
      const statusFiltered = all.filter((p) => !status || p.status === status);
      const rows = filterProjectsByClientOrg(statusFiltered, clientOrgId).map((p) => ({
        id: p.id,
        name: p.name,
        status: p.status,
        client: p.client,
        clientOrganizationId: p.clientOrganizationId,
        owner: p.owner.name ?? p.owner.email,
        openTasks: p.openTaskCount,
        totalTasks: p.taskCount,
      }));
      return json({ count: rows.length, projects: rows });
    }

    case "create_task": {
      const title = str(args, "title");
      if (!title) return fail("title is required");
      const projectRef = str(args, "project");
      let projectId: string | undefined;
      if (projectRef) {
        const resolved = await resolveProjectId(projectRef);
        if (!resolved) return fail(`No project matched "${projectRef}"`);
        projectId = resolved;
      }
      const assigneeRef = str(args, "assignee");
      let assignedToId = ctx.actorId; // default: yourself
      if (assigneeRef) {
        const resolved = await resolveAssigneeId(assigneeRef);
        if (!resolved) return fail(`No assignee matched "${assigneeRef}" — call list_assignees to see valid VAs`);
        if (!isManager && resolved !== ctx.actorId) {
          return fail("Your role can only create tasks for yourself. Ask a team lead to assign tasks to others.");
        }
        assignedToId = resolved;
      }
      const task = await createTask(ctx.actorId, ctx.actorRole, {
        title,
        instructions: str(args, "instructions"),
        priority: str(args, "priority"),
        dueDate: str(args, "dueDate"),
        projectId,
        assignedToId,
      });
      return json({ created: true, id: task.id, title: task.title, assignedTo: task.assignedTo.name ?? task.assignedTo.email, emailSent: task.emailSent, url: `${BASE_URL}/hr/tasks/${task.id}` });
    }

    // ── Task delegators ─────────────────────────────────────────────────────
    case "list_tasks": {
      const ref = str(args, "project");
      const status = str(args, "status");
      const clientOrgId = str(args, "clientOrgId");
      const assigneeRef = str(args, "assignee");
      const projectId = ref ? await resolveProjectId(ref) : undefined;
      if (ref && !projectId) return fail(`No project matched "${ref}"`);
      let assignedToId: string | undefined;
      if (assigneeRef) {
        const resolved = await resolveAssigneeId(assigneeRef);
        if (!resolved) return fail(`No assignee matched "${assigneeRef}"`);
        assignedToId = resolved;
      }
      const tasks = await db.task.findMany({
        where: {
          ...(projectId ? { projectId } : {}),
          ...(assignedToId ? { assignedToId } : {}),
          ...(status && VALID_STATUS.has(status) ? { status: status as TaskStatus } : {}),
          ...taskClientOrgWhere(clientOrgId),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          title: true,
          status: true,
          priority: true,
          dueDate: true,
          client: true,
          clientOrganizationId: true,
          assignedTo: { select: { name: true, email: true } },
          project: { select: { name: true } },
        },
      });
      return json({
        count: tasks.length,
        tasks: tasks.map((t) => ({ ...taskSummary(t), clientOrganizationId: t.clientOrganizationId })),
      });
    }

    case "list_assignees": {
      const client = str(args, "client");
      // Explicit ClientAssignment (who's formally on this account) outranks derived history.
      let assignedSet = new Set<string>();
      if (client) {
        const org = await db.clientOrganization.findFirst({
          where: { OR: [{ name: { equals: client, mode: "insensitive" } }, { slug: client.toLowerCase() }] },
          select: { id: true },
        });
        if (org) {
          const a = await db.clientAssignment.findMany({ where: { clientOrganizationId: org.id }, select: { userId: true } });
          assignedSet = new Set(a.map((x) => x.userId));
        }
      }
      const vas = await db.user.findMany({
        where: { role: "VA", active: true },
        select: {
          id: true, name: true, email: true, role: true,
          va: { select: { compensationRole: true, skillSpecs: true, availabilityNotes: true, targetHoursWeekly: true } },
        },
        orderBy: { name: "asc" },
      });
      const rows = await Promise.all(
        vas.map(async (va) => {
          const [openTasks, recent, clientRows] = await Promise.all([
            db.task.count({ where: { assignedToId: va.id, status: { not: "Done" } } }),
            db.task.findMany({ where: { assignedToId: va.id }, orderBy: { createdAt: "desc" }, take: 6, select: { title: true, client: true } }),
            db.task.findMany({ where: { assignedToId: va.id, client: { not: null } }, distinct: ["client"], select: { client: true }, take: 30 }),
          ]);
          const clients = clientRows.map((r) => r.client).filter((c): c is string => !!c);
          return {
            id: va.id,
            name: va.name ?? va.email,
            email: va.email,
            role: va.role,
            compRole: va.va?.compensationRole ?? null,
            skills: va.va?.skillSpecs ?? null,
            availability: va.va?.availabilityNotes ?? null,
            targetHoursWeekly: va.va?.targetHoursWeekly ?? null,
            openTasks,
            recentTasks: recent.map((t) => t.title),
            clientsWorkedWith: clients,
            ...(client
              ? {
                  assignedToClient: assignedSet.has(va.id),
                  workedWithClient: clients.some((c) => c.toLowerCase() === client.toLowerCase()),
                }
              : {}),
          };
        }),
      );
      // Best-fit ordering: prior experience with the client first, then least loaded.
      rows.sort((a, b) => {
        if (client) {
          const aa = "assignedToClient" in a && a.assignedToClient ? 1 : 0;
          const ba = "assignedToClient" in b && b.assignedToClient ? 1 : 0;
          if (aa !== ba) return ba - aa;
          const aw = "workedWithClient" in a && a.workedWithClient ? 1 : 0;
          const bw = "workedWithClient" in b && b.workedWithClient ? 1 : 0;
          if (aw !== bw) return bw - aw;
        }
        return a.openTasks - b.openTasks;
      });
      return json({ count: rows.length, assignees: rows, note: client ? `Ordered by who's assigned to "${client}", then prior experience, then lowest workload.` : "Ordered by lowest current workload." });
    }

    case "reassign_task": {
      const taskId = str(args, "taskId");
      const assigneeRef = str(args, "assignee");
      if (!taskId || !assigneeRef) return fail("taskId and assignee are required");
      const assigneeId = await resolveAssigneeId(assigneeRef);
      if (!assigneeId) return fail(`No assignee matched "${assigneeRef}" — call list_assignees to see valid VAs`);
      const updated = await reassignTask(ctx.actorId, ctx.actorRole, taskId, assigneeId);
      return json({ reassigned: true, id: updated.id, title: updated.title, assignedTo: updated.assignee });
    }

    case "resolve_claim": {
      const taskId = str(args, "taskId");
      const approve = bool(args, "approve");
      if (!taskId || approve === undefined) return fail("taskId and approve (true/false) are required");
      await resolveClaim(ctx.actorId, ctx.actorRole, taskId, approve);
      return json({ resolved: true, taskId, approved: approve });
    }

    case "create_project": {
      const name_ = str(args, "name");
      if (!name_) return fail("name is required");
      const project = await createProject(ctx.actorId, ctx.actorRole, {
        name: name_,
        description: str(args, "description"),
        client: str(args, "client"),
        priority: str(args, "priority"),
        dueDate: str(args, "dueDate"),
        ownerId: ctx.actorId,
      });
      return json({ created: true, id: project.id, name: project.name, url: `${BASE_URL}/hr/projects/${project.id}` });
    }

    case "update_project": {
      const ref = str(args, "project");
      if (!ref) return fail("project (id or name) is required");
      const projectId = await resolveProjectId(ref);
      if (!projectId) return fail(`No project matched "${ref}"`);
      const priority = enumArg(args, "priority", PRIORITY);
      const status = enumArg(args, "status", PROJECT_STATUS);
      const type = enumArg(args, "type", PROJECT_TYPE);
      const bad = priority.error ?? status.error ?? type.error;
      if (bad) return fail(bad);
      // Only forward fields the caller actually passed (updateProject does partial updates).
      const p = await updateProject(ctx.actorId, ctx.actorRole, projectId, {
        ...(str(args, "name") !== undefined ? { name: str(args, "name") } : {}),
        ...("description" in args ? { description: str(args, "description") } : {}),
        ...("client" in args ? { client: str(args, "client") } : {}),
        ...(priority.value !== undefined ? { priority: priority.value } : {}),
        ...(status.value !== undefined ? { status: status.value } : {}),
        ...(type.value !== undefined ? { type: type.value } : {}),
        ...(str(args, "dueDate") !== undefined ? { dueDate: str(args, "dueDate") } : {}),
      });
      return json({ updated: true, id: p.id, name: p.name, url: `${BASE_URL}/hr/projects/${p.id}` });
    }

    case "update_task": {
      const taskId = str(args, "taskId");
      if (!taskId) return fail("taskId is required");
      const priority = enumArg(args, "priority", PRIORITY);
      const strategy = enumArg(args, "strategy", TASK_STRATEGY);
      const bad = priority.error ?? strategy.error;
      if (bad) return fail(bad);
      const statusVal = str(args, "status");
      if (statusVal !== undefined && !VALID_STATUS.has(statusVal)) return fail("status must be one of: NotStarted, InProgress, Done, Blocked");
      const t = await updateTask(ctx.actorId, ctx.actorRole, taskId, {
        ...(str(args, "title") !== undefined ? { title: str(args, "title") } : {}),
        ...("instructions" in args ? { instructions: str(args, "instructions") } : {}),
        ...(priority.value !== undefined ? { priority: priority.value } : {}),
        ...(strategy.value !== undefined ? { strategy: strategy.value } : {}),
        ...(statusVal !== undefined ? { status: statusVal } : {}),
        ...("client" in args ? { client: str(args, "client") } : {}),
        ...(str(args, "dueDate") !== undefined ? { dueDate: str(args, "dueDate") } : {}),
      });
      return json({ updated: true, id: t.id, title: t.title, url: `${BASE_URL}/hr/tasks/${t.id}` });
    }

    // ── HR ──────────────────────────────────────────────────────────────────
    case "team_overview": {
      const includeDeparted = bool(args, "includeDeparted") ?? false;
      const vas = await db.va.findMany({
        where: includeDeparted ? {} : { status: { in: ["active", "training"] } },
        orderBy: [{ status: "asc" }, { name: "asc" }],
        select: {
          vaId: true, name: true, email: true, compensationRole: true, status: true,
          targetHoursWeekly: true, lastCheckinDate: true, skillSpecs: true,
          supervisor: { select: { name: true } },
          users: { select: { id: true, role: true } },
        },
      });
      const rows = await Promise.all(
        vas.map(async (v) => {
          const userIds = v.users.map((u) => u.id);
          const openTasks = userIds.length
            ? await db.task.count({ where: { assignedToId: { in: userIds }, status: { not: "Done" } } })
            : 0;
          return {
            name: v.name,
            email: v.email,
            tier: v.compensationRole,
            status: v.status,
            consoleRole: v.users[0]?.role ?? null,
            supervisor: v.supervisor?.name ?? null,
            targetHoursWeekly: v.targetHoursWeekly,
            lastCheckin: v.lastCheckinDate?.toISOString().slice(0, 10) ?? null,
            skills: v.skillSpecs,
            openTasks,
          };
        }),
      );
      return json({ count: rows.length, team: rows });
    }

    case "get_va_profile": {
      const ref = str(args, "va");
      if (!ref) return fail("va (name or email) is required");
      const va = await db.va.findFirst({
        where: { OR: [{ email: { equals: ref, mode: "insensitive" } }, { name: { contains: ref, mode: "insensitive" } }] },
        select: {
          vaId: true, name: true, email: true, compensationRole: true, status: true,
          targetHoursWeekly: true, skillSpecs: true, availabilityNotes: true, lastCheckinDate: true,
          whatsappNumber: true, notifyChannel: true, roleStartedDate: true, notionProfileUrl: true,
          supervisor: { select: { name: true, email: true } },
          users: { select: { id: true, role: true } },
        },
      });
      if (!va) return fail(`No VA matched "${ref}" — try team_overview to see the roster.`);
      const userIds = va.users.map((u) => u.id);
      const [openTasks, recentTasks] = userIds.length
        ? await Promise.all([
            db.task.findMany({ where: { assignedToId: { in: userIds }, status: { not: "Done" } }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, title: true, status: true, priority: true, dueDate: true, client: true } }),
            db.task.findMany({ where: { assignedToId: { in: userIds }, status: "Done" }, orderBy: { createdAt: "desc" }, take: 10, select: { title: true, client: true } }),
          ])
        : [[], []];
      return json({
        name: va.name,
        email: va.email,
        tier: va.compensationRole,
        status: va.status,
        consoleRole: va.users[0]?.role ?? null,
        supervisor: va.supervisor ? { name: va.supervisor.name, email: va.supervisor.email } : null,
        targetHoursWeekly: va.targetHoursWeekly,
        skills: va.skillSpecs,
        availability: va.availabilityNotes,
        lastCheckin: va.lastCheckinDate?.toISOString().slice(0, 10) ?? null,
        roleStarted: va.roleStartedDate?.toISOString().slice(0, 10) ?? null,
        whatsapp: va.whatsappNumber,
        notifyChannel: va.notifyChannel,
        notionProfile: va.notionProfileUrl,
        openTasks: openTasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null, client: t.client })),
        recentlyCompleted: recentTasks.map((t) => t.title),
      });
    }

    // ── Payroll ─────────────────────────────────────────────────────────────
    case "payroll_summary": {
      const d = await getPayrollDashboard();
      return json({
        openPeriod: d.openPeriod
          ? { start: d.openPeriod.periodStart.toISOString().slice(0, 10), end: d.openPeriod.periodEnd.toISOString().slice(0, 10), status: d.openPeriod.status }
          : null,
        totals: { grossPay: Math.round(d.totalGross * 100) / 100, hours: Math.round(d.totalHours * 100) / 100 },
        rows: d.calcRows.map((r) => ({
          name: r.name,
          tier: r.compensationRole,
          type: r.compensationType,
          hours: r.hoursInPeriod,
          hourlyRate: r.hourlyRate,
          salaryPerPeriod: r.salaryPerPeriod,
          grossPay: r.grossPay,
        })),
        recentApprovedRateChanges: d.rateChanges.map((rc) => ({ vaId: rc.vaId, decidedAt: rc.hrDecisionDate?.toISOString().slice(0, 10) ?? null })),
        pastPeriods: d.pastPeriods.map((p) => ({ start: p.periodStart.toISOString().slice(0, 10), end: p.periodEnd.toISOString().slice(0, 10), status: p.status })),
      });
    }

    // ── Recruitment ─────────────────────────────────────────────────────────
    case "recruitment_pipeline": {
      const includeClosed = bool(args, "includeClosed") ?? false;
      const p = await getPipeline(includeClosed);
      return json({
        countsByStage: p.counts,
        count: p.candidates.length,
        candidates: p.candidates.map((c) => ({
          id: c.candidateId,
          name: c.name,
          email: c.email,
          country: c.country,
          stage: c.currentStage,
          source: c.source,
          skills: c.skillsRoleTags,
          scores: { ai: c.aiSkillScore, communication: c.commScore, reliability: c.reliabilityScore, ownership: c.ownershipScore, skillFit: c.skillFitScore },
          recruiterRecommendation: c.recruiterRecommendation,
          finalDecision: c.finalDecision,
          lastUpdated: c.lastUpdated.toISOString().slice(0, 10),
        })),
      });
    }

    // ── Sales ───────────────────────────────────────────────────────────────
    case "list_deals": {
      const stage = str(args, "stage");
      const deals = await db.deal.findMany({
        where: stage && DEAL_STAGES.includes(stage as DealStage) ? { stage: stage as DealStage } : {},
        orderBy: { updatedAt: "desc" },
        take: 100,
        include: { agreement: { select: { status: true, signedAt: true, paidAt: true, sentAt: true } } },
      });
      return json({
        count: deals.length,
        deals: deals.map((d) => ({
          id: d.id,
          org: d.orgName,
          stage: d.stage,
          package: d.packageName,
          value: d.dealValue,
          billing: d.billingType,
          contactEmail: d.contactEmail,
          clientOrgId: d.clientOrgId,
          agreement: d.agreement ? { status: d.agreement.status, sent: !!d.agreement.sentAt, signed: !!d.agreement.signedAt, paid: !!d.agreement.paidAt } : null,
        })),
      });
    }

    case "create_deal": {
      const orgName = str(args, "orgName");
      if (!orgName) return fail("orgName is required");
      const dealValue = typeof args.dealValue === "number" ? args.dealValue : undefined;
      const startRaw = str(args, "startDate");
      const deal = await createDeal({
        orgName,
        contactName: str(args, "contactName") ?? null,
        contactEmail: str(args, "contactEmail") ?? null,
        packageName: str(args, "packageName") ?? null,
        dealValue: dealValue ?? null,
        billingType: str(args, "billingType") ?? null,
        startDate: startRaw ? new Date(startRaw) : null,
        stage: (str(args, "stage") as DealStage | undefined) ?? "verbal_yes",
        notionPageId: str(args, "notionPageId") ?? null,
      });
      return json({ created: true, id: deal.id, org: deal.orgName, stage: deal.stage });
    }

    case "send_client_agreement": {
      const dealId = str(args, "dealId");
      if (!dealId) return fail("dealId is required");
      const a = await sendClientAgreement(dealId);
      return json({ sent: true, dealId, status: a.status });
    }

    case "convert_deal_to_client": {
      const dealId = str(args, "dealId");
      if (!dealId) return fail("dealId is required");
      const org = await convertDealToClient(dealId);
      return json({ ok: true, clientOrgId: org.id, name: org.name, slug: org.slug, status: org.status });
    }

    default:
      return fail(`Unknown tool: ${name}`);
  }
}
