import type { TaskStatus } from "@prisma/client";

type UrgencyTask = { id: string; dueDate: Date | null; status: TaskStatus };

function urgencyBucket(task: UrgencyTask, now: Date): number {
  if (task.status === "Done") return 4;
  if (!task.dueDate) return 3;
  if (task.dueDate < now) return 0;
  const sevenDays = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  if (task.dueDate <= sevenDays) return 1;
  return 2;
}

export function sortTasksByUrgency<T extends UrgencyTask>(tasks: T[], now: Date = new Date()): T[] {
  return [...tasks].sort((a, b) => urgencyBucket(a, now) - urgencyBucket(b, now));
}

type ProgressTask = { status: TaskStatus };

export function computeProjectProgress(tasks: ProgressTask[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.status === "Done").length;
  return Math.round((done / tasks.length) * 100);
}

type ActTask = { assignedToId: string; assignedById: string };

// A task participant (assignee/creator) can always act; otherwise it takes delegation
// authority. `isDelegator` is the tier-driven flag (see canUserDelegateTasks) — HR and
// other specialized roles no longer get a blanket task-management bypass.
export function canUserActOnTask(userId: string, isDelegator: boolean, task: ActTask): boolean {
  if (isDelegator) return true;
  return task.assignedToId === userId || task.assignedById === userId;
}

export function inheritTaskClient(
  taskClient: string | null | undefined,
  projectClient: string | null | undefined,
): string | null {
  return taskClient ?? projectClient ?? null;
}
