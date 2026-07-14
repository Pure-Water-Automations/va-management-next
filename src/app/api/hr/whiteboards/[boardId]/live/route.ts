import { getCurrentUser } from "@/lib/auth/access";
import { publish, colorFor } from "@/lib/realtime/boardHub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Upstream channel for live collaboration: the client posts an op or a cursor move,
// we re-broadcast it (with server-verified identity) to every OTHER connection on the
// board. Intentionally NOT wrapped in action() — cursor moves are high-frequency and
// must not flood the audit log. Identity always comes from the session, never the body.
export async function POST(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false }, { status: 401 });
  }
  if (!user.caps.manageTasks) return Response.json({ ok: false }, { status: 403 });

  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }

  const connId = typeof body.connId === "string" ? body.connId : null;
  const kind = body.kind;
  const name = user.name ?? user.email;
  const color = colorFor(user.id);

  if (kind === "op" && body.op && typeof body.op === "object") {
    publish(boardId, connId, { t: "op", op: body.op, from: user.id });
  } else if (kind === "cursor") {
    publish(boardId, connId, {
      t: "cursor",
      connId,
      userId: user.id,
      name,
      color,
      x: typeof body.x === "number" ? body.x : 0,
      y: typeof body.y === "number" ? body.y : 0,
    });
  }

  return Response.json({ ok: true });
}
