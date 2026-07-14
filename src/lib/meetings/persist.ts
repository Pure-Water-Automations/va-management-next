/**
 * The single MeetingAction write for the VPS file-scanning worker
 * (transcript-to-tasks.ts). One review surface (/meeting-actions), one
 * confirm→Task path.
 */
import { db } from "@/lib/db";
import type { ProposedItem } from "@/lib/meetings/extract";

export type PersistMeetingActionsInput = {
  meetingFile: string; // unique idempotency key (a file path)
  meetingTitle: string;
  meetingDate: Date | null;
  zoomAccount: string | null;
  items: ProposedItem[];
};

/**
 * Create the MeetingAction (+ nested items) for one meeting. Idempotent on
 * meetingFile: if a row already exists it's returned unchanged (so webhook retries
 * / overlapping timer runs can't double-create). Status mirrors the original
 * worker: RESOLVED when there are no items, else PENDING for a lead to confirm.
 */
export async function persistMeetingActions(
  input: PersistMeetingActionsInput,
): Promise<{ id: string }> {
  const existing = await db.meetingAction.findUnique({
    where: { meetingFile: input.meetingFile },
    select: { id: true },
  });
  if (existing) return existing;

  return db.meetingAction.create({
    data: {
      meetingFile: input.meetingFile,
      meetingTitle: input.meetingTitle,
      meetingDate: input.meetingDate,
      zoomAccount: input.zoomAccount,
      status: input.items.length === 0 ? "RESOLVED" : "PENDING",
      items: {
        create: input.items.map((it) => ({
          title: it.title,
          description: it.description ?? null,
          suggestedAssignee: it.suggestedAssignee ?? null,
          suggestedDueDate: it.suggestedDueDate ? new Date(it.suggestedDueDate) : null,
          clientContext: it.clientContext ?? null,
        })),
      },
    },
    select: { id: true },
  });
}
