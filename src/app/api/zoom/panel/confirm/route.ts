/**
 * POST /api/zoom/panel/confirm — in-call confirm: turn a proposed item into a
 * real Task via the SAME confirmMeetingActionItem path the console uses (task
 * creation enforces delegation authority, sends the assignment email, audits).
 * Panel-token auth; only mapped users whose caps allow reviewing AND delegating
 * may confirm — guests/clients endorse via /vote instead (planning-doc guardrail:
 * no direct task creation from a client surface).
 */
import { runWithActor } from "@/lib/request-context";
import { confirmMeetingActionItem } from "@/lib/actions/meeting-actions";
import { itemInMeeting, panelViewer } from "@/lib/zoom/panel-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const viewer = await panelViewer(request);
  if (!viewer) return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });
  const user = viewer.user;
  if (!user?.canConfirm) {
    return Response.json(
      { ok: false, error: "Confirming needs review + delegation permission — ask a reviewer in the meeting" },
      { status: 403 },
    );
  }

  let body: { itemId?: string; assigneeId?: string; dueDate?: string };
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.itemId || !body.assigneeId) {
    return Response.json({ ok: false, error: "itemId and assigneeId required" }, { status: 400 });
  }

  const item = await itemInMeeting(body.itemId, viewer.meetingUuid);
  if (!item) return Response.json({ ok: false, error: "Item not found in this meeting" }, { status: 404 });

  try {
    const result = await runWithActor(user.email, () =>
      confirmMeetingActionItem(user, { itemId: body.itemId!, assigneeId: body.assigneeId!, dueDate: body.dueDate }),
    );
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
