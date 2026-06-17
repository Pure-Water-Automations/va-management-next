import type { TaskStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { sortTasksByUrgency } from "@/lib/services/tasks";

export type TaskListItem = Awaited<ReturnType<typeof getMyTasks>>[number];
export type TaskDetail = Awaited<ReturnType<typeof getTaskDetail>>;

const TASK_INCLUDE = {
  project: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  assignedBy: { select: { id: true, name: true } },
  comments: {
    orderBy: { createdAt: "asc" as const },
    include: { author: { select: { id: true, name: true } } },
  },
} as const;

export async function getMyTasks(userId: string) {
  const tasks = await db.task.findMany({
    where: { assignedToId: userId },
    include: TASK_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
  return sortTasksByUrgency(tasks);
}

export async function getAllTasks(opts?: {
  assignedToId?: string;
  status?: string;
  client?: string;
}) {
  return db.task.findMany({
    where: {
      ...(opts?.assignedToId ? { assignedToId: opts.assignedToId } : {}),
      ...(opts?.status ? { status: opts.status as TaskStatus } : {}),
      ...(opts?.client
        ? { client: { contains: opts.client, mode: "insensitive" as const } }
        : {}),
    },
    include: TASK_INCLUDE,
    orderBy: { createdAt: "desc" },
  });
}

export async function getTaskDetail(taskId: string) {
  return db.task.findUnique({
    where: { id: taskId },
    include: TASK_INCLUDE,
  });
}
