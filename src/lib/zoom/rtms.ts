/**
 * RTMS (Realtime Media Streams) webhook handling — Zoom Meeting App Phase 2.
 *
 * `meeting.rtms_started` arrives when a live transcript stream becomes available
 * for a meeting (auto-start, REST start, or the in-meeting panel's startRTMS()).
 * The webhook must ack fast, so — mirroring the Phase-1 recording path — we only
 * record a ZoomMeetingCapture row (source=RTMS) holding the join credentials
 * (server_urls + rtms_stream_id); the long-running worker/rtms-live.ts polls for
 * PENDING rows and does the actual join + live extraction.
 *
 * Parsing helpers are pure (unit-tested in tests/zoom-rtms.test.ts); the record*
 * functions do single-row idempotent DB writes.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { parseRtmsEvent, type ZoomWebhookEvent } from "@/lib/zoom/webhook";

/** Shape of ZoomMeetingCapture.payload for source=RTMS rows. */
export type RtmsCapturePayload = {
  rtms: { streamId: string | null; serverUrls: string | null; operatorId: string | null };
  startedAt: string; // ISO — from event_ts (or receipt time)
  stoppedAt?: string; // set by meeting.rtms_stopped (worker also detects stream close)
  // Written by the in-meeting panel (roster + topic) and the worker (counters):
  roster?: { name: string }[];
  topic?: string;
  stats?: { segments: number; itemsProposed: number; lastActivityAt: string };
};

const asJson = (v: unknown) => JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

export type RecordRtmsResult = "created" | "updated" | "restarted" | "ignored";

/**
 * Webhook side of meeting.rtms_started: idempotently queue a live session for the
 * RTMS worker. A PENDING/LIVE row for the same meeting just gets fresh join info
 * (Zoom can restart a stream mid-meeting with new server_urls); a finished row is
 * re-opened (stream restarted after the worker closed it); a RECORDING row for the
 * same uuid is left alone — the recording path already owns that meeting.
 */
export async function recordRtmsStart(event: ZoomWebhookEvent): Promise<RecordRtmsResult> {
  const info = parseRtmsEvent(event);
  if (!info || !info.streamId || !info.serverUrls) return "ignored";

  const startedAt = new Date(info.eventTs ?? Date.now()).toISOString();
  const existing = await db.zoomMeetingCapture.findUnique({ where: { meetingUuid: info.meetingUuid } });

  if (!existing) {
    await db.zoomMeetingCapture.create({
      data: {
        meetingUuid: info.meetingUuid,
        topic: "Zoom live meeting", // rtms_started carries no topic; the panel backfills it
        hostZoomId: info.operatorId ?? "unknown",
        source: "RTMS",
        status: "PENDING",
        payload: asJson({
          rtms: { streamId: info.streamId, serverUrls: info.serverUrls, operatorId: info.operatorId },
          startedAt,
        } satisfies RtmsCapturePayload),
      },
    });
    return "created";
  }

  if (existing.source !== "RTMS") return "ignored";

  const prev = (existing.payload ?? {}) as Partial<RtmsCapturePayload>;
  const payload = asJson({
    ...prev,
    rtms: { streamId: info.streamId, serverUrls: info.serverUrls, operatorId: info.operatorId },
    startedAt: prev.startedAt ?? startedAt,
    stoppedAt: undefined, // stream is (re)running
  });

  if (existing.status === "PENDING" || existing.status === "LIVE") {
    await db.zoomMeetingCapture.update({ where: { id: existing.id }, data: { payload } });
    return "updated";
  }
  // PROCESSED/SKIPPED/FAILED — the stream came back (or first join failed): re-queue.
  await db.zoomMeetingCapture.update({
    where: { id: existing.id },
    data: { status: "PENDING", attempts: 0, error: null, processedAt: null, payload },
  });
  return "restarted";
}

/**
 * Webhook side of meeting.rtms_stopped: stamp stoppedAt into the capture payload.
 * The worker treats this as an end signal (it also detects the socket closing on
 * its own — this is belt-and-suspenders for a worker that missed the close).
 */
export async function recordRtmsStop(event: ZoomWebhookEvent): Promise<"stamped" | "ignored"> {
  const info = parseRtmsEvent(event);
  if (!info) return "ignored";

  const existing = await db.zoomMeetingCapture.findUnique({ where: { meetingUuid: info.meetingUuid } });
  if (!existing || existing.source !== "RTMS") return "ignored";

  const prev = (existing.payload ?? {}) as Partial<RtmsCapturePayload>;
  await db.zoomMeetingCapture.update({
    where: { id: existing.id },
    data: { payload: asJson({ ...prev, stoppedAt: new Date(info.eventTs ?? Date.now()).toISOString() }) },
  });
  return "stamped";
}
