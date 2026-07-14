import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AuthorizationError } from "@/lib/auth/roles";
import { canUserDelegateTasks } from "@/lib/auth/delegation";
import type { Role } from "@prisma/client";

export async function addDependency(
  actorId: string,
  actorRole: Role,
  taskId: string,
  dependsOnTaskId: string,
) {
  if (!(await canUserDelegateTasks(actorId, actorRole))) {
    throw new AuthorizationError("Only delegators can edit task dependencies");
  }
  if (taskId === dependsOnTaskId) {
    throw new Error("A task cannot depend on itself");
  }

  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { title: true },
  });

  try {
    const dep = await db.taskDependency.create({
      data: { taskId, dependsOnTaskId },
    });

    await logActivity({
      source: "dependency_action",
      eventType: "task_dependency_added",
      severity: "info",
      summary: `Dependency added on task "${task.title}".`,
    });

    return dep;
  } catch {
    // Unique constraint (taskId, dependsOnTaskId) — already exists.
    throw new Error("That dependency already exists");
  }
}

export async function removeDependency(actorId: string, actorRole: Role, id: string) {
  if (!(await canUserDelegateTasks(actorId, actorRole))) {
    throw new AuthorizationError("Only delegators can edit task dependencies");
  }

  await db.taskDependency.delete({ where: { id } });

  await logActivity({
    source: "dependency_action",
    eventType: "task_dependency_removed",
    severity: "info",
    summary: "Task dependency removed.",
  });

  return { ok: true };
}
