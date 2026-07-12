import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { join, leave, colorFor, type BoardUser } from "@/lib/realtime/boardHub";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Live-collaboration downstream channel: one long-lived SSE connection per open board.
// The client posts ops/cursor to the sibling /live route; the hub fans them back out here.
export async function GET(_request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return new Response("Not authenticated", { status: 401 });
  }
  if (!user.isAdmin && !canManageTasks(user.role)) return new Response("Not authorized", { status: 403 });

  const board = await db.projectWhiteboard.findUnique({ where: { id: boardId }, select: { id: true } });
  if (!board) return new Response("Not found", { status: 404 });

  const connId = crypto.randomUUID();
  const me: BoardUser = { userId: user.id, name: user.name ?? user.email, color: colorFor(user.id) };
  const enc = new TextEncoder();

  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const enqueue = (line: string): boolean => {
        try {
          controller.enqueue(enc.encode(line));
          return true;
        } catch {
          return false;
        }
      };

      // Greet the client with its identity + connId (used to exclude itself on POST).
      enqueue(`data: ${JSON.stringify({ t: "hello", connId, you: me })}\n\n`);
      join(boardId, { connId, ...me, enqueue });

      // Comment heartbeat keeps the connection alive through Cloudflare's idle timeout.
      heartbeat = setInterval(() => {
        if (!enqueue(`: ping\n\n`)) cleanup();
      }, 25000);
    },
    cancel() {
      cleanup();
    },
  });

  function cleanup() {
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    leave(boardId, connId);
  }

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // disable nginx/proxy buffering so events flush immediately
    },
  });
}
