/**
 * POST /api/zoom/panel/roster — the panel pushes meeting context the RTMS stream
 * doesn't carry: the meeting topic (rtms_started has none) and the participant
 * roster (display names, host/co-host only can read it). The live worker reads
 * both from the capture payload each tick — topic renames the MeetingAction,
 * roster seeds the speaker-identity cache.
 */
import { db } from "@/lib/db";
import { panelViewer } from "@/lib/zoom/panel-server";
import type { RtmsCapturePayload } from "@/lib/zoom/rtms";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const viewer = await panelViewer(request);
  if (!viewer) return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });

  let body: { topic?: string; participants?: Array<{ name?: string }> };
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const capture = await db.zoomMeetingCapture.findUnique({
    where: { meetingUuid: viewer.meetingUuid },
    select: { id: true, payload: true },
  });
  // No capture row yet (rtms_started webhook still in flight) — harmless; the
  // panel retries on the next participant change.
  if (!capture) return Response.json({ ok: true, pending: true });

  const prev = (capture.payload ?? {}) as Partial<RtmsCapturePayload>;
  const names = new Map<string, { name: string }>();
  for (const r of prev.roster ?? []) if (r?.name) names.set(r.name, { name: r.name });
  for (const p of body.participants ?? []) {
    const n = typeof p?.name === "string" ? p.name.trim().slice(0, 80) : "";
    if (n) names.set(n, { name: n });
  }
  const payload: Partial<RtmsCapturePayload> = {
    ...prev,
    roster: Array.from(names.values()).slice(0, 100),
    topic: typeof body.topic === "string" && body.topic.trim() ? body.topic.trim().slice(0, 200) : prev.topic,
  };

  await db.zoomMeetingCapture.update({
    where: { id: capture.id },
    data: { payload: JSON.parse(JSON.stringify(payload)) },
  });
  return Response.json({ ok: true });
}
