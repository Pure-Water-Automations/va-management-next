import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, str as settingStr } from "@/lib/settings";
import { canManageTasks, AuthorizationError } from "@/lib/auth/roles";
import { canUserDelegateTasks, getActorTier } from "@/lib/auth/delegation";
import { createNotification, supervisorUserId } from "@/lib/inbox";
import { inheritTaskClient } from "@/lib/services/tasks";
import type { Role, TaskStatus, TaskStrategy, Priority } from "@prisma/client";

export type CreateTaskInput = {
  title: unknown;
  instructions?: unknown;
  strategy?: unknown;
  priority?: unknown;
  client?: unknown;
  projectId?: unknown;
  assignedToId: unknown;
  dueDate?: unknown;
  links?: unknown;
  relatedSops?: unknown;
  relatedTrainings?: unknown;
  suggestedTools?: unknown;
};

export type UpdateTaskInput = Partial<Omit<CreateTaskInput, "assignedToId"> & { status?: unknown }>;

const TASK_STATUSES = new Set(["NotStarted", "InProgress", "Done", "Blocked"]);
const PRIORITIES = new Set(["Low", "Medium", "High"]);

function requireText(val: unknown, field: string): string {
  if (typeof val !== "string" || !val.trim()) throw new Error(`${field} is required`);
  return val.trim();
}
function optionalText(val: unknown): string | undefined {
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}
function optionalDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? undefined : d;
}

async function sendTaskAssignmentEmail(opts: {
  from: string;
  toEmail: string;
  toName: string | null;
  taskId: string;
  taskTitle: string;
  strategy: string;
  priority: string;
  dueDate: Date | null | undefined;
  assignedByName: string | null;
  instructions: string | null | undefined;
  links: string | null | undefined;
}): Promise<boolean> {
  const dueDateStr = opts.dueDate
    ? opts.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "No due date";

  const body = [
    `Hi ${opts.toName ?? "there"},`,
    ``,
    `You have been assigned a new task.`,
    ``,
    `Title: ${opts.taskTitle}`,
    `Strategy: ${opts.strategy}`,
    `Priority: ${opts.priority}`,
    `Due: ${dueDateStr}`,
    `Assigned by: ${opts.assignedByName ?? "Team"}`,
    ``,
    opts.instructions ? `Instructions:\n${opts.instructions}` : null,
    opts.links ? `\nLinks: ${opts.links}` : null,
    ``,
    `View task: https://team.pwasecondbrain.uk/va/tasks/${opts.taskId}`,
  ]
    .filter((l): l is string => l !== null)
    .join("\n");

  // Best-effort, non-fatal: a delivery failure must never block the task itself.
  try {
    const result = await sendSystemEmail({
      from: opts.from,
      to: opts.toEmail,
      subject: `📋 New task assigned: ${opts.taskTitle}`,
      body,
    });
    return result.ok;
  } catch (err) {
    console.warn(
      `sendTaskAssignmentEmail failed for task ${opts.taskId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return false;
  }
}

export async function createTask(actorId: string, actorRole: Role, input: CreateTaskInput) {
  const title = requireText(input.title, "title");
  const assignedToId = requireText(input.assignedToId, "assignedToId");
  const projectId = optionalText(input.projectId);

  // Authority (cards #22/#24): managers + tier-flagged VAs may delegate freely;
  // additionally any Tier-1+ VA may self-add a task onto a project.
  const canDelegate = await canUserDelegateTasks(actorId, actorRole);
  if (!canDelegate) {
    const tier = await getActorTier(actorId);
    const selfAddToProject = !!projectId && !!tier && tier !== "TRAINEE";
    if (!selfAddToProject) throw new AuthorizationError("You don't have permission to create tasks");
  }

  // Resolve client: task-level client or inherit from project
  let projectClient: string | null = null;
  if (projectId) {
    const proj = await db.project.findUnique({ where: { id: projectId }, select: { client: true } });
    projectClient = proj?.client ?? null;
  }
  const client = inheritTaskClient(optionalText(input.client), projectClient) ?? undefined;

  const task = await db.task.create({
    data: {
      title,
      instructions: optionalText(input.instructions),
      strategy: (optionalText(input.strategy) as TaskStrategy | undefined) ?? "Create",
      priority: (optionalText(input.priority) as Priority | undefined) ?? "Medium",
      client,
      projectId: projectId ?? null,
      assignedToId,
      assignedById: actorId,
      dueDate: optionalDate(input.dueDate),
      links: optionalText(input.links),
      relatedSops: input.relatedSops ?? undefined,
      relatedTrainings: input.relatedTrainings ?? undefined,
      suggestedTools: input.suggestedTools ?? undefined,
    },
    include: {
      assignedTo: { select: { email: true, name: true } },
      assignedBy: { select: { name: true } },
    },
  });

  // Send assignment email (best-effort — task is always saved)
  const settings = await loadSettings();
  const from = settingStr(settings, "system_email_from");
  let emailSent = false;
  if (from && task.assignedTo.email) {
    emailSent = await sendTaskAssignmentEmail({
      from,
      toEmail: task.assignedTo.email,
      toName: task.assignedTo.name,
      taskId: task.id,
      taskTitle: task.title,
      strategy: task.strategy,
      priority: task.priority,
      dueDate: task.dueDate,
      assignedByName: task.assignedBy.name,
      instructions: task.instructions,
      links: task.links,
    });
    if (emailSent) {
      await db.task.update({ where: { id: task.id }, data: { emailSent: true } });
    }
  }

  await logActivity({
    source: "task_action",
    eventType: "task_assigned",
    severity: "success",
    summary: `Task "${task.title}" assigned to ${task.assignedTo.name ?? task.assignedTo.email}.`,
  });

  // In-console notification for the assignee (any delegator, incl. managers) so the
  // person the task was assigned to sees the bell — the email above is separate.
  if (task.assignedToId !== actorId) {
    await createNotification(
      task.assignedToId,
      "task_assigned",
      `${task.assignedBy.name ?? "Someone"} assigned you a task: "${task.title}"`,
      `/va/tasks/${task.id}`,
    );
  }

  // In-console supervisor ping when a VA (non-manager) added the task (card #24).
  if (actorRole === "VA" || actorRole === "SENIOR_VA") {
    const supId = await supervisorUserId(actorId);
    if (supId && supId !== actorId) {
      await createNotification(
        supId,
        "task_added",
        `${task.assignedBy.name ?? "A team member"} added task "${task.title}"`,
        `/hr/tasks/${task.id}`,
      );
    }
  }

  return { ...task, emailSent };
}

export async function updateTaskStatus(
  actorId: string,
  actorRole: Role,
  taskId: string,
  status: TaskStatus,
) {
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { assignedToId: true, assignedById: true, title: true, projectId: true },
  });

  const isManager = ["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD", "SENIOR_VA"].includes(actorRole);
  const isParticipant = task.assignedToId === actorId || task.assignedById === actorId;
  if (!isManager && !isParticipant) throw new AuthorizationError("You are not allowed to update this task");

  const updated = await db.task.update({
    where: { id: taskId },
    data: { status },
    select: { id: true, title: true, status: true },
  });

  await logActivity({
    source: "task_action",
    eventType: "task_status_changed",
    severity: "info",
    summary: `Task "${updated.title}" status changed to ${status}.`,
  });

  // Light automation (card #12): roll the parent project's status from its tasks.
  if (task.projectId) {
    const [siblings, proj] = await Promise.all([
      db.task.findMany({ where: { projectId: task.projectId }, select: { status: true } }),
      db.project.findUnique({ where: { id: task.projectId }, select: { status: true } }),
    ]);
    if (proj) {
      const allDone = siblings.length > 0 && siblings.every((s) => s.status === "Done");
      if (allDone && proj.status !== "Done") {
        await db.project.update({ where: { id: task.projectId }, data: { status: "Done" } });
      } else if (!allDone && proj.status === "Planning" && status !== "NotStarted") {
        await db.project.update({ where: { id: task.projectId }, data: { status: "Active" } });
      }
    }
  }

  return updated;
}

export async function updateTask(
  actorId: string,
  actorRole: Role,
  taskId: string,
  input: UpdateTaskInput,
) {
  if (!canManageTasks(actorRole)) throw new AuthorizationError("Only team leads and senior VAs can edit tasks");

  const task = await db.task.update({
    where: { id: taskId },
    data: {
      ...(input.title !== undefined ? { title: requireText(input.title, "title") } : {}),
      ...(input.instructions !== undefined ? { instructions: optionalText(input.instructions) } : {}),
      ...(input.strategy !== undefined ? { strategy: optionalText(input.strategy) as TaskStrategy } : {}),
      ...(input.priority !== undefined ? { priority: optionalText(input.priority) as Priority } : {}),
      ...(input.status !== undefined && TASK_STATUSES.has(optionalText(input.status) ?? "")
        ? { status: optionalText(input.status) as TaskStatus }
        : {}),
      ...(input.client !== undefined ? { client: optionalText(input.client) } : {}),
      ...(input.dueDate !== undefined ? { dueDate: optionalDate(input.dueDate) } : {}),
      ...(input.links !== undefined ? { links: optionalText(input.links) } : {}),
      ...(input.relatedSops !== undefined ? { relatedSops: input.relatedSops ?? undefined } : {}),
      ...(input.relatedTrainings !== undefined ? { relatedTrainings: input.relatedTrainings ?? undefined } : {}),
      ...(input.suggestedTools !== undefined ? { suggestedTools: input.suggestedTools ?? undefined } : {}),
    },
    select: { id: true, title: true },
  });

  await logActivity({
    source: "task_action",
    eventType: "task_updated",
    severity: "info",
    summary: `Task "${task.title}" updated.`,
  });

  return task;
}

export type BulkUpdateTaskPatch = {
  status?: unknown;
  priority?: unknown;
  assignedToId?: unknown;
  dueDate?: unknown;
};

export async function bulkUpdateTasks(
  actorId: string,
  actorRole: Role,
  taskIds: string[],
  patch: BulkUpdateTaskPatch,
) {
  if (!canManageTasks(actorRole)) throw new AuthorizationError("Not allowed to update tasks");
  const ids = Array.isArray(taskIds) ? taskIds.filter((x): x is string => typeof x === "string" && !!x) : [];
  if (ids.length === 0) throw new Error("No tasks selected");

  const data: { status?: TaskStatus; priority?: Priority; assignedToId?: string; dueDate?: Date | null } = {};

  const status = typeof patch.status === "string" ? patch.status : undefined;
  if (status && TASK_STATUSES.has(status)) data.status = status as TaskStatus;

  const priority = typeof patch.priority === "string" ? patch.priority : undefined;
  if (priority && PRIORITIES.has(priority)) data.priority = priority as Priority;

  if (typeof patch.assignedToId === "string" && patch.assignedToId) data.assignedToId = patch.assignedToId;

  if (patch.dueDate !== undefined) {
    if (patch.dueDate === null || patch.dueDate === "") data.dueDate = null;
    else {
      const d = new Date(patch.dueDate as string);
      if (!isNaN(d.getTime())) data.dueDate = d;
    }
  }

  if (Object.keys(data).length === 0) throw new Error("Nothing to update");

  const res = await db.task.updateMany({ where: { id: { in: ids } }, data });

  await logActivity({
    source: "task_action",
    eventType: "tasks_bulk_updated",
    severity: "info",
    summary: `Bulk-updated ${res.count} task(s): ${Object.keys(data).join(", ")}`,
  });

  return { count: res.count };
}
