import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AuthorizationError, canManageTasks } from "@/lib/auth/roles";
import { createTask } from "@/lib/actions/tasks";
import type { Role } from "@prisma/client";

export async function addScratchItem(
  actorId: string,
  actorRole: Role,
  projectId: string,
  text: string,
) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("You don't have permission to use the scratchpad");
  const t = text.trim();
  if (!t) throw new Error("Scratch text is required");
  await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true } });
  const order = await db.scratchItem.count({ where: { projectId } });
  return db.scratchItem.create({
    data: { projectId, text: t, order, createdById: actorId },
  });
}

export async function updateScratchItem(
  actorId: string,
  actorRole: Role,
  itemId: string,
  text: string,
) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("You don't have permission to use the scratchpad");
  const t = text.trim();
  if (!t) {
    // Emptying a bullet deletes it (promoted bullets keep their history).
    const item = await db.scratchItem.findUniqueOrThrow({ where: { id: itemId } });
    if (item.promotedTaskId) throw new Error("Promoted items can't be deleted");
    await db.scratchItem.delete({ where: { id: itemId } });
    return { id: itemId, deleted: true };
  }
  return db.scratchItem.update({ where: { id: itemId }, data: { text: t } });
}

/**
 * Promote a bullet into a real Task (source "scratchpad"). If the bullet came
 * from a client request, the request flips to ASSIGNED so the portal shows
 * "Turned into a task ✓".
 */
export async function promoteScratchItem(
  actorId: string,
  actorRole: Role,
  itemId: string,
  input?: { assignedToId?: string; dueDate?: string },
) {
  const item = await db.scratchItem.findUniqueOrThrow({ where: { id: itemId } });
  if (item.promotedTaskId) throw new Error("Already promoted");

  const task = await createTask(actorId, actorRole, {
    title: item.text,
    projectId: item.projectId,
    assignedToId: input?.assignedToId ?? actorId,
    dueDate: input?.dueDate,
    strategy: "Create",
  });

  await db.task.update({ where: { id: task.id }, data: { source: "scratchpad" } });
  await db.scratchItem.update({ where: { id: itemId }, data: { promotedTaskId: task.id } });

  if (item.clientTaskRequestId) {
    await db.clientTaskRequest
      .update({
        where: { id: item.clientTaskRequestId },
        data: { status: "ASSIGNED", assignedTaskId: task.id },
      })
      .catch(() => undefined); // request may have been resolved another way
  }

  await logActivity({
    source: "scratch_action",
    eventType: "scratch_promoted",
    severity: "success",
    summary: `Scratchpad item promoted to task "${item.text.slice(0, 60)}".`,
  });

  return { taskId: task.id };
}
