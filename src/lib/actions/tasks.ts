import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, str as settingStr } from "@/lib/settings";
import { canManageTasks, AuthorizationError } from "@/lib/auth/roles";
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
  if (!canManageTasks(actorRole)) throw new AuthorizationError("Only team leads and senior VAs can assign tasks");

  const title = requireText(input.title, "title");
  const assignedToId = requireText(input.assignedToId, "assignedToId");

  // Resolve client: task-level client or inherit from project
  let projectClient: string | null = null;
  const projectId = optionalText(input.projectId);
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
    select: { assignedToId: true, assignedById: true, title: true },
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
      ...(input.status !== undefined ? { status: optionalText(input.status) as TaskStatus } : {}),
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
