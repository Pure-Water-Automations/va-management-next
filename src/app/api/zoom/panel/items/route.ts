/**
 * GET /api/zoom/panel/items?token=… — SSE stream of the meeting's proposed items.
 *
 * The RTMS worker is a separate process, so there's no in-memory pubsub to tap:
 * the stream is DB-poll-backed (every 2.5s, cheap indexed reads) and only emits
 * when the snapshot actually changed. EventSource carries the panel token in the
 * query string because it can't set headers.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { meetingFileForUuid, panelViewer } from "@/lib/zoom/panel-server";
import type { RtmsCapturePayload } from "@/lib/zoom/rtms";

export const dynamic = "force-dynamic";

const POLL_MS = 2500;
const HEARTBEAT_MS = 20_000;
const MAX_STREAM_MS = 4 * 60 * 60_000;

type Snapshot = {
  session: { status: string; stats: RtmsCapturePayload["stats"] | null; topic: string | null } | null;
  action: { id: string; status: string } | null;
  items: Array<{
    id: string;
    title: string;
    description: string | null;
    clientContext: string | null;
    suggestedAssignee: string | null;
    suggestedDueDate: string | null;
    kind: string | null;
    confidence: number | null;
    evidenceQuote: string | null;
    status: string;
    taskId: string | null;
    liveVotes: Prisma.JsonValue;
  }>;
};

async function snapshot(meetingUuid: string): Promise<Snapshot> {
  const capture = await db.zoomMeetingCapture.findUnique({ where: { meetingUuid } });
  const action = await db.meetingAction.findUnique({
    where: { meetingFile: meetingFileForUuid(meetingUuid) },
    include: { items: { orderBy: { createdAt: "asc" } } },
  });
  const payload = (capture?.payload ?? {}) as Partial<RtmsCapturePayload>;
  return {
    session: capture
      ? { status: capture.status, stats: payload.stats ?? null, topic: payload.topic ?? capture.topic }
      : null,
    action: action ? { id: action.id, status: action.status } : null,
    items: (action?.items ?? []).map((it) => ({
      id: it.id,
      title: it.title,
      description: it.description,
      clientContext: it.clientContext,
      suggestedAssignee: it.suggestedAssignee,
      suggestedDueDate: it.suggestedDueDate ? it.suggestedDueDate.toISOString().slice(0, 10) : null,
      kind: it.kind,
      confidence: it.confidence,
      evidenceQuote: it.evidenceQuote,
      status: it.status,
      taskId: it.taskId,
      liveVotes: it.liveVotes,
    })),
  };
}

export async function GET(request: Request): Promise<Response> {
  const viewer = await panelViewer(request);
  if (!viewer) return Response.json({ ok: false, error: "Not authorized" }, { status: 401 });
  const meetingUuid = viewer.meetingUuid;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      let ticking = false;
      let lastJson = "";
      const startedAt = Date.now();

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      const tick = async () => {
        if (ticking || closed) return;
        ticking = true;
        try {
          const snap = await snapshot(meetingUuid);
          const json = JSON.stringify(snap);
          if (json !== lastJson) {
            lastJson = json;
            write(`event: snapshot\ndata: ${json}\n\n`);
          }
        } catch {
          /* transient DB error — next poll retries */
        } finally {
          ticking = false;
        }
      };

      const poll = setInterval(() => {
        if (Date.now() - startedAt > MAX_STREAM_MS) {
          send("bye", {});
          cleanup();
          return;
        }
        void tick();
      }, POLL_MS);
      const heartbeat = setInterval(() => write(`: ping\n\n`), HEARTBEAT_MS);

      const cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(poll);
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      request.signal.addEventListener("abort", cleanup);
      void tick(); // initial snapshot immediately
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
