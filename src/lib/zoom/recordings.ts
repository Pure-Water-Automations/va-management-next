/**
 * Zoom recording capture + processing.
 *
 *  - recordCapture()  runs in the webhook: a fast, idempotent insert of a PENDING
 *    ZoomMeetingCapture. NO download/LLM work here — the webhook must ack in ~3s or
 *    Zoom retries it.
 *  - processCapture() runs in the timer worker: download the TRANSCRIPT, convert to
 *    the Meetings/*.md shape, run the SAME extraction, and persist into the shared
 *    MeetingAction pipeline. It deliberately does NOT apply the harvester's
 *    ALLOWED_ACCOUNTS / shouldProcess scope gate — that gate is for the internal
 *    Northeast/BFC accounts; Zoom-app captures come from clients' own accounts.
 */
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { openrouterChat } from "@/lib/matrix/openrouter";
import { buildExtractionMessages, parseExtractedItems } from "@/lib/meetings/extract";
import { persistMeetingActions } from "@/lib/meetings/persist";
import { accessTokenForHost } from "@/lib/zoom/connection";
import { cuesToTranscript, parseVtt } from "@/lib/zoom/vtt";
import type { ZoomRecordingObject, ZoomWebhookEvent } from "@/lib/zoom/webhook";

const EXTRACTION_MODEL = env.OPENROUTER_TRANSCRIPT_MODEL || "google/gemini-2.5-flash-lite";

type CapturePayload = { object: ZoomRecordingObject; download_token: string | null };

/** Webhook side: idempotently enqueue a recording for the worker to process. */
export async function recordCapture(event: ZoomWebhookEvent): Promise<"created" | "duplicate" | "ignored"> {
  const obj = event.payload?.object;
  if (!obj?.uuid || !obj.host_id) return "ignored";

  const stored: CapturePayload = { object: obj, download_token: event.download_token ?? null };
  const existing = await db.zoomMeetingCapture.findUnique({
    where: { meetingUuid: obj.uuid },
    select: { id: true },
  });
  if (existing) return "duplicate";

  await db.zoomMeetingCapture.create({
    data: {
      meetingUuid: obj.uuid,
      topic: obj.topic || "Zoom meeting",
      hostZoomId: obj.host_id,
      source: "RECORDING",
      status: "PENDING",
      // JSON round-trip drops undefined and yields a plain JSON value.
      payload: JSON.parse(JSON.stringify(stored)) as Prisma.InputJsonValue,
    },
  });
  return "created";
}

export type ProcessResult =
  | { status: "PROCESSED"; meetingActionId: string; itemCount: number }
  | { status: "SKIPPED"; reason: string };

type CaptureRow = { meetingUuid: string; topic: string; hostZoomId: string; payload: Prisma.JsonValue | null };

/**
 * Worker side: process one PENDING capture. Returns SKIPPED (no transcript, empty
 * transcript) or PROCESSED (MeetingAction created). Throws on transient failures
 * (missing token, download error, unparseable model output) so the worker marks it
 * FAILED and retries on a later run.
 */
export async function processCapture(capture: CaptureRow): Promise<ProcessResult> {
  const payload = capture.payload as CapturePayload | null;
  const obj = payload?.object;
  if (!obj) throw new Error("capture payload missing recording object");

  const transcriptFile = (obj.recording_files || []).find((f) => f.file_type === "TRANSCRIPT");
  if (!transcriptFile?.download_url) {
    return { status: "SKIPPED", reason: "no transcript file (host lacks cloud recording + audio transcription)" };
  }

  // Prefer the account's OAuth token (long-lived, refreshable); fall back to the
  // webhook's short-lived download_token when the account isn't connected yet.
  const token = (await accessTokenForHost(capture.hostZoomId)) || payload?.download_token || null;
  if (!token) throw new Error("no Zoom access token or download_token available for host");

  const res = await fetch(transcriptFile.download_url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`transcript download failed (${res.status})`);
  const vtt = await res.text();

  const body = cuesToTranscript(parseVtt(vtt));
  if (!body.trim()) return { status: "SKIPPED", reason: "empty transcript" };

  const date = obj.start_time ? new Date(obj.start_time) : null;
  const meta = {
    title: obj.topic || "Zoom meeting",
    zoomAccount: obj.host_email || null,
    date: date && !isNaN(date.getTime()) ? date : null,
    body,
  };

  const llm = await openrouterChat({
    messages: buildExtractionMessages(meta),
    temperature: 0.2,
    max_tokens: 1500,
    model: EXTRACTION_MODEL,
  });
  const items = parseExtractedItems(llm.choices?.[0]?.message?.content ?? "");
  if (items === null) throw new Error("unparseable model output");

  const action = await persistMeetingActions({
    meetingFile: `zoom-app://${capture.meetingUuid}`,
    meetingTitle: meta.title,
    meetingDate: meta.date,
    zoomAccount: meta.zoomAccount,
    source: "ZOOM_APP_RECORDING",
    items,
  });

  return { status: "PROCESSED", meetingActionId: action.id, itemCount: items.length };
}
