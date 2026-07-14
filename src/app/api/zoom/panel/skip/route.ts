/**
 * POST /api/zoom/panel/skip — reviewer skips a proposed item in-call. Skips
 * (with optional reason) are logged as training signal for where the live
 * classifier over-triggers.
 */
import { db } from "@/lib/db";
import { runWithActor } from "@/lib/request-context";
import { skipMeetingActionItems } from "@/lib/actions/meeting-actions";
import { itemInMeeting, panelViewer } from "@/lib/zoom/panel-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const viewer = await panelViewer(request);
  if (!viewer) return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });
  const user = viewer.user;
  if (!user?.caps.reviewMeetingActions) {
    return Response.json({ ok: false, error: "Skipping needs reviewer permission" }, { status: 403 });
  }

  let body: { itemId?: string; reason?: string };
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.itemId) return Response.json({ ok: false, error: "itemId required" }, { status: 400 });

  const item = await itemInMeeting(body.itemId, viewer.meetingUuid);
  if (!item) return Response.json({ ok: false, error: "Item not found in this meeting" }, { status: 404 });

  try {
    const result = await runWithActor(user.email, () =>
      skipMeetingActionItems(user, { meetingActionId: item.meetingActionId, itemId: item.id }),
    );
    if (body.reason?.trim()) {
      await db.meetingActionItem.update({
        where: { id: item.id },
        data: { skipReason: body.reason.trim().slice(0, 300) },
      });
    }
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
