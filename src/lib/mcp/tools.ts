import type { DealStage, Role, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getProjectsList } from "@/lib/reads/projects";
import { createProject } from "@/lib/actions/projects";
import { createTask, updateTaskStatus } from "@/lib/actions/tasks";
import { createDeal, convertDealToClient, DEAL_STAGES } from "@/lib/sales/deal";
import { sendClientAgreement } from "@/lib/sales/agreement";
import { filterProjectsByClientOrg, taskClientOrgWhere } from "./scoping";

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

export async function executeTool(name: string, args: Record<string, unknown>, ctx: McpCtx): Promise<{ text: string; isError?: boolean }> {
  const json = (v: unknown) => ({ text: JSON.stringify(v, null, 2) });
  const fail = (msg: string) => ({ text: msg, isError: true });

  switch (name) {
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
      return json({ created: true, id: project.id, name: project.name, url: `https://dev-team.pwasecondbrain.uk/hr/projects/${project.id}` });
    }

    case "list_tasks": {
      const ref = str(args, "project");
      const status = str(args, "status");
      const clientOrgId = str(args, "clientOrgId");
      const projectId = ref ? await resolveProjectId(ref) : undefined;
      if (ref && !projectId) return fail(`No project matched "${ref}"`);
      const tasks = await db.task.findMany({
        where: {
          ...(projectId ? { projectId } : {}),
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
        tasks: tasks.map((t) => ({
          id: t.id,
          title: t.title,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate?.toISOString().slice(0, 10) ?? null,
          client: t.client,
          clientOrganizationId: t.clientOrganizationId,
          assignee: t.assignedTo.name ?? t.assignedTo.email,
          project: t.project?.name ?? null,
        })),
      });
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
      let assignedToId = ctx.actorId; // default: the MCP service user
      if (assigneeRef) {
        const resolved = await resolveAssigneeId(assigneeRef);
        if (!resolved) return fail(`No assignee matched "${assigneeRef}" — call list_assignees to see valid VAs`);
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
      return json({ created: true, id: task.id, title: task.title, assignedTo: task.assignedTo.name ?? task.assignedTo.email, emailSent: task.emailSent, url: `https://dev-team.pwasecondbrain.uk/hr/tasks/${task.id}` });
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

    case "update_task_status": {
      const taskId = str(args, "taskId");
      const status = str(args, "status");
      if (!taskId || !status || !VALID_STATUS.has(status)) return fail("taskId and a valid status (NotStarted|InProgress|Done|Blocked) are required");
      const updated = await updateTaskStatus(ctx.actorId, ctx.actorRole, taskId, status as TaskStatus);
      return json({ updated: true, id: updated.id, title: updated.title, status: updated.status });
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
