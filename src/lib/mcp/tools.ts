import type { Role, TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { getProjectsList } from "@/lib/reads/projects";
import { createProject } from "@/lib/actions/projects";
import { createTask, updateTaskStatus } from "@/lib/actions/tasks";

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
      const project = await createProject(ctx.actorId, ctx.actorRole, {
        name: name_,
        description: str(args, "description"),
        client: str(args, "client"),
        priority: str(args, "priority"),
        dueDate: str(args, "dueDate"),
        ownerId: ctx.actorId,
      });
      return json({ created: true, id: project.id, name: project.name, url: `https://team.pwasecondbrain.uk/hr/projects/${project.id}` });
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
      return json({ created: true, id: task.id, title: task.title, assignedTo: task.assignedTo.name ?? task.assignedTo.email, emailSent: task.emailSent, url: `https://team.pwasecondbrain.uk/hr/tasks/${task.id}` });
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

    default:
      return fail(`Unknown tool: ${name}`);
  }
}
