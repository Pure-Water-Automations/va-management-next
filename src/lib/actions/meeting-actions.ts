import { db } from "@/lib/db";
import { createTask } from "@/lib/actions/tasks";
import { logActivity } from "@/lib/activity";
import { allItemsResolved } from "@/lib/services/meeting-actions";
import type { CurrentUser } from "@/lib/auth/access";

/** Flip a MeetingAction to RESOLVED once all its items are confirmed/skipped. */
async function maybeResolveAction(meetingActionId: string): Promise<void> {
  const items = await db.meetingActionItem.findMany({
    where: { meetingActionId },
    select: { status: true },
  });
  if (allItemsResolved(items)) {
    await db.meetingAction.update({ where: { id: meetingActionId }, data: { status: "RESOLVED" } });
  }
}

/** Confirm one item → create a real Task via createTask, then mark CONFIRMED. */
export async function confirmMeetingActionItem(
  user: CurrentUser,
  input: { itemId: string; assigneeId: string; dueDate?: string },
) {
  const item = await db.meetingActionItem.findUnique({ where: { id: input.itemId } });
  if (!item) throw new Error("Meeting action item not found");
  if (item.status !== "PENDING") throw new Error("Item already resolved");

  // createTask enforces delegation authority, sends the assignment email, and
  // writes ActivityLog + a notification — identical to a manually created task.
  const task = await createTask(user.id, user.role, {
    title: item.title,
    instructions: item.description ?? undefined,
    assignedToId: input.assigneeId,
    dueDate: input.dueDate,
    client: item.clientContext ?? undefined,
  });

  // OS Hub provenance: powers the ✨ source badge on task rows.
  await db.task.update({ where: { id: task.id }, data: { source: "meeting" } });

  await db.meetingActionItem.update({
    where: { id: item.id },
    data: { status: "CONFIRMED", taskId: task.id, resolvedBy: user.email, resolvedAt: new Date() },
  });
  await maybeResolveAction(item.meetingActionId);
  return { taskId: task.id };
}

/** Skip one item, or all still-pending items on a meeting. */
export async function skipMeetingActionItems(
  user: CurrentUser,
  input: { meetingActionId: string; itemId?: string; all?: boolean },
) {
  if (!input.all && !input.itemId) throw new Error("itemId or all required");
  const where = input.all
    ? { meetingActionId: input.meetingActionId, status: "PENDING" as const }
    : { id: input.itemId, meetingActionId: input.meetingActionId, status: "PENDING" as const };

  const result = await db.meetingActionItem.updateMany({
    where,
    data: { status: "SKIPPED", resolvedBy: user.email, resolvedAt: new Date() },
  });
  if (result.count > 0) {
    await logActivity({
      source: "meeting_action",
      eventType: "items_skipped",
      severity: "success",
      summary: `Skipped ${result.count} meeting action item(s).`,
    });
  }
  await maybeResolveAction(input.meetingActionId);
  return { ok: true, skipped: result.count };
}
