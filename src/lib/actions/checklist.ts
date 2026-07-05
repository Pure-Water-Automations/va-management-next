import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AuthorizationError } from "@/lib/auth/roles";
import { canUserActOnTask } from "@/lib/services/tasks";
import { canUserDelegateTasks } from "@/lib/auth/delegation";
import type { Role } from "@prisma/client";

export async function addChecklistItem(
  actorId: string,
  actorRole: Role,
  taskId: string,
  text: string,
) {
  if (!text.trim()) throw new Error("Checklist item text cannot be empty");

  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { assignedToId: true, assignedById: true, title: true },
  });

  if (!canUserActOnTask(actorId, await canUserDelegateTasks(actorId, actorRole), task)) {
    throw new AuthorizationError("You are not allowed to edit this task's checklist");
  }

  const order = await db.checklistItem.count({ where: { taskId } });

  const item = await db.checklistItem.create({
    data: { taskId, text: text.trim(), order },
  });

  await logActivity({
    source: "checklist_action",
    eventType: "checklist_item_added",
    severity: "info",
    summary: `Checklist item added on task "${task.title}".`,
  });

  return item;
}

export async function toggleChecklistItem(actorId: string, actorRole: Role, itemId: string) {
  const item = await db.checklistItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { task: { select: { assignedToId: true, assignedById: true, title: true } } },
  });

  if (!canUserActOnTask(actorId, await canUserDelegateTasks(actorId, actorRole), item.task)) {
    throw new AuthorizationError("You are not allowed to edit this task's checklist");
  }

  const updated = await db.checklistItem.update({
    where: { id: itemId },
    data: { done: !item.done },
  });

  await logActivity({
    source: "checklist_action",
    eventType: "checklist_item_toggled",
    severity: "info",
    summary: `Checklist item ${updated.done ? "completed" : "reopened"} on task "${item.task.title}".`,
  });

  return updated;
}

export async function deleteChecklistItem(actorId: string, actorRole: Role, itemId: string) {
  const item = await db.checklistItem.findUniqueOrThrow({
    where: { id: itemId },
    include: { task: { select: { assignedToId: true, assignedById: true, title: true } } },
  });

  if (!canUserActOnTask(actorId, await canUserDelegateTasks(actorId, actorRole), item.task)) {
    throw new AuthorizationError("You are not allowed to edit this task's checklist");
  }

  await db.checklistItem.delete({ where: { id: itemId } });

  await logActivity({
    source: "checklist_action",
    eventType: "checklist_item_deleted",
    severity: "info",
    summary: `Checklist item removed on task "${item.task.title}".`,
  });

  return { ok: true };
}
