/**
 * POST /api/zoom/panel/vote — in-call endorsement (👍 looks right / 👎 not a task)
 * from ANY participant, including guests and clients. Votes never create or
 * resolve anything — they're signal for the reviewer (shown in the panel and
 * kept on MeetingActionItem.liveVotes). One vote per Zoom user, last one wins.
 */
import { db } from "@/lib/db";
import { itemInMeeting, panelViewer } from "@/lib/zoom/panel-server";

export const dynamic = "force-dynamic";

type Vote = { by: string; name: string; vote: "up" | "down"; ts: number };

export async function POST(request: Request): Promise<Response> {
  const viewer = await panelViewer(request);
  if (!viewer) return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });

  let body: { itemId?: string; vote?: string };
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body.itemId || (body.vote !== "up" && body.vote !== "down")) {
    return Response.json({ ok: false, error: "itemId and vote (up|down) required" }, { status: 400 });
  }

  const item = await itemInMeeting(body.itemId, viewer.meetingUuid);
  if (!item) return Response.json({ ok: false, error: "Item not found in this meeting" }, { status: 404 });

  const prev = Array.isArray(item.liveVotes) ? (item.liveVotes as unknown as Vote[]) : [];
  const entry: Vote = {
    by: viewer.token.uid,
    name: viewer.token.name || viewer.user?.name || "Guest",
    vote: body.vote,
    ts: Date.now(),
  };
  const votes = prev.filter((v) => v && v.by !== entry.by).concat(entry);

  await db.meetingActionItem.update({
    where: { id: item.id },
    data: { liveVotes: JSON.parse(JSON.stringify(votes)) },
  });
  return Response.json({ ok: true, votes: votes.length });
}
