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
    where: { assignedToId: userId, claimable: false },
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
      claimable: false, // open-pool tasks live only in Available, not normal task lists
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
    include: {
      ...TASK_INCLUDE,
      checklist: { orderBy: { order: "asc" as const } },
      dependencies: {
        include: {
          dependsOn: { select: { id: true, title: true, status: true } },
        },
      },
    },
  });
}

/** Tasks in the open/claimable pool (claimable=true), with any pending claimer. */
export async function getAvailableTasks() {
  return db.task.findMany({
    where: { claimable: true },
    orderBy: [{ claimRequestedById: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      title: true,
      instructions: true,
      priority: true,
      dueDate: true,
      client: true,
      project: { select: { id: true, name: true } },
      assignedBy: { select: { name: true } },
      claimRequestedBy: { select: { id: true, name: true, email: true } },
    },
  });
}
