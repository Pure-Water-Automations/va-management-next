import type { DealStage, Role, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getProjectsList } from "@/lib/reads/projects";
import { createProject, updateProject } from "@/lib/actions/projects";
import { createTask, updateTaskStatus, reassignTask, updateTask } from "@/lib/actions/tasks";
import { addTaskComment } from "@/lib/actions/comments";
import { getTaskDetail } from "@/lib/reads/tasks";
import { createDeal, convertDealToClient, DEAL_STAGES } from "@/lib/sales/deal";
import { sendClientAgreement } from "@/lib/sales/agreement";

/** Base URL for links returned to the AI client (prod domain fallback). */
const BASE_URL = env.APP_BASE_URL ?? env.NEXTAUTH_URL ?? "https://team.purewaterautomations.com";

export type McpCtx = { actorId: string; actorRole: Role };

function str(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
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

export async function executeTool(name: string, args: Record<string, unknown>, ctx: McpCtx): Promise<{ text: string; isError?: boolean }> {
  const json = (v: unknown) => ({ text: JSON.stringify(v, null, 2) });
  const fail = (msg: string) => ({ text: msg, isError: true });

  switch (name) {
    case "list_projects": {
      const status = str(args, "status");
      const all = await getProjectsList();
      const rows = all
        .filter((p) => !status || p.status === status)
        .map((p) => ({
          id: p.id,
          name: p.name,
          status: p.status,
          client: p.client,
          owner: p.owner.name ?? p.owner.email,
          openTasks: p.openTaskCount,
          totalTasks: p.taskCount,
        }));
      return json({ count: rows.length, projects: rows });
    }

    case "create_project": {
      const name_ = str(args, "name");
      if (!name_) return fail("name is required");
      const priority = enumArg(args, "priority", PRIORITY);
      const status = enumArg(args, "status", PROJECT_STATUS);
      const type = enumArg(args, "type", PROJECT_TYPE);
      const bad = priority.error ?? status.error ?? type.error;
      if (bad) return fail(bad);
      const project = await createProject(ctx.actorId, ctx.actorRole, {
        name: name_,
        description: str(args, "description"),
        client: str(args, "client"),
        priority: priority.value,
        status: status.value,
        type: type.value,
        dueDate: str(args, "dueDate"),
        ownerId: ctx.actorId,
      });
      return json({ created: true, id: project.id, name: project.name, url: `${BASE_URL}/hr/projects/${project.id}` });
    }

    case "list_tasks": {
      const ref = str(args, "project");
      const status = str(args, "status");
      const projectId = ref ? await resolveProjectId(ref) : undefined;
      if (ref && !projectId) return fail(`No project matched "${ref}"`);
      const tasks = await db.task.findMany({
        where: { ...(projectId ? { projectId } : {}), ...(status && VALID_STATUS.has(status) ? { status: status as TaskStatus } : {}) },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: { id: true, title: true, status: true, priority: true, dueDate: true, client: true, assignedTo: { select: { name: true, email: true } }, project: { select: { name: true } } },
      });
      return json({
        count: tasks.length,
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
          client: t.client,
          assignee: t.assignedTo.name ?? t.assignedTo.email,
          project: t.project?.name ?? null,
        })),
      });
    }

    case "create_task": {
      const title = str(args, "title");
      if (!title) return fail("title is required");
      const priority = enumArg(args, "priority", PRIORITY);
      const strategy = enumArg(args, "strategy", TASK_STRATEGY);
      if (priority.error ?? strategy.error) return fail((priority.error ?? strategy.error)!);
      const projectRef = str(args, "project");
      let projectId: string | undefined;
      if (projectRef) {
        const resolved = await resolveProjectId(projectRef);
        if (!resolved) return fail(`No project matched "${projectRef}"`);
        projectId = resolved;
      }
      const claimable = args.claimable === true;
      const assigneeRef = str(args, "assignee");
      // claimable → open pool (no specific assignee). Otherwise default to the caller.
      let assignedToId: string | undefined = claimable ? undefined : ctx.actorId;
      if (assigneeRef) {
        const resolved = await resolveAssigneeId(assigneeRef);
        if (!resolved) return fail(`No assignee matched "${assigneeRef}" — call list_assignees to see valid VAs`);
        assignedToId = resolved;
      }
      const task = await createTask(ctx.actorId, ctx.actorRole, {
        title,
        instructions: str(args, "instructions"),
        priority: priority.value,
        strategy: strategy.value,
        client: str(args, "client"),
        dueDate: str(args, "dueDate"),
        projectId,
        assignedToId,
        claimable,
      });
      return json({
        created: true,
        id: task.id,
        title: task.title,
        claimable,
        assignedTo: task.assignedTo?.name ?? task.assignedTo?.email ?? (claimable ? "(open pool)" : null),
        emailSent: task.emailSent,
        url: `${BASE_URL}/hr/tasks/${task.id}`,
      });
    }

    case "list_assignees": {
      const client = str(args, "client");
      const vas = await db.user.findMany({
        where: { role: { in: ["VA", "SENIOR_VA"] }, active: true },
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
            ...(client ? { workedWithClient: clients.some((c) => c.toLowerCase() === client.toLowerCase()) } : {}),
          };
        }),
      );
      // Best-fit ordering: prior experience with the client first, then least loaded.
      rows.sort((a, b) => {
        if (client) {
          const aw = "workedWithClient" in a && a.workedWithClient ? 1 : 0;
          const bw = "workedWithClient" in b && b.workedWithClient ? 1 : 0;
          if (aw !== bw) return bw - aw;
        }
        return a.openTasks - b.openTasks;
      });
      return json({ count: rows.length, assignees: rows, note: client ? `Ordered by prior experience with "${client}", then lowest workload.` : "Ordered by lowest current workload." });
    }

    case "update_task_status": {
      const taskId = str(args, "taskId");
      const status = str(args, "status");
      if (!taskId || !status || !VALID_STATUS.has(status)) return fail("taskId and a valid status (NotStarted|InProgress|Done|Blocked) are required");
      const updated = await updateTaskStatus(ctx.actorId, ctx.actorRole, taskId, status as TaskStatus);
      return json({ updated: true, id: updated.id, title: updated.title, status: updated.status });
    }

    case "get_task": {
      const taskId = str(args, "taskId");
      if (!taskId) return fail("taskId is required");
      const t = await getTaskDetail(taskId);
      if (!t) return fail(`No task with id "${taskId}"`);
      return json({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        client: t.client,
        project: t.project ? { id: t.project.id, name: t.project.name } : null,
        assignedTo: t.assignedTo ? (t.assignedTo.name ?? t.assignedTo.email) : null,
        assignedBy: t.assignedBy?.name ?? null,
        dueDate: t.dueDate,
        instructions: t.instructions,
        comments: t.comments.map((c) => ({ author: c.author.name ?? "Someone", body: c.body, at: c.createdAt })),
      });
    }

    case "reassign_task": {
      const taskId = str(args, "taskId");
      const assigneeRef = str(args, "assignee");
      if (!taskId || !assigneeRef) return fail("taskId and assignee are required");
      const newAssigneeId = await resolveAssigneeId(assigneeRef);
      if (!newAssigneeId) return fail(`No assignee matched "${assigneeRef}" — call list_assignees to see valid VAs`);
      const t = await reassignTask(ctx.actorId, ctx.actorRole, taskId, newAssigneeId);
      return json({ reassigned: true, id: t.id, title: t.title });
    }

    case "add_task_comment": {
      const taskId = str(args, "taskId");
      const body = str(args, "body");
      if (!taskId || !body) return fail("taskId and body are required");
      const c = await addTaskComment(ctx.actorId, ctx.actorRole, taskId, body);
      return json({ added: true, id: c.id, at: c.createdAt });
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
