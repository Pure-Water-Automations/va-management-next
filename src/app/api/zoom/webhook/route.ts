import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { recordCapture } from "@/lib/zoom/recordings";
import {
  urlValidationResponse,
  verifyZoomSignature,
  type ZoomWebhookEvent,
} from "@/lib/zoom/webhook";

// PUBLIC — Zoom posts here; must be on the Cloudflare Access bypass.
// Disabled (503) until ZOOM_WEBHOOK_SECRET_TOKEN is set; rejects unsigned events.
// Does only fast, idempotent work (record a capture) — the transcript download +
// extraction happen later in worker/zoom-capture-process.ts, so we always ack in time.
export async function POST(request: Request): Promise<Response> {
  const secret = env.ZOOM_WEBHOOK_SECRET_TOKEN?.trim();
  if (!secret) return Response.json({ ok: false, error: "Zoom webhook disabled" }, { status: 503 });

  const raw = await request.text();
  let event: ZoomWebhookEvent;
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  // Endpoint validation handshake (sent when you save the endpoint URL in the
  // Marketplace). Answering with the HMAC of plainToken proves we hold the secret.
  if (event.event === "endpoint.url_validation" && event.payload?.plainToken) {
    return Response.json(urlValidationResponse(event.payload.plainToken, secret));
  }

  const sig = request.headers.get("x-zm-signature");
  const ts = request.headers.get("x-zm-request-timestamp");
  if (!verifyZoomSignature(raw, sig, ts, secret)) {
    return Response.json({ ok: false, error: "Invalid signature" }, { status: 401 });
  }

  try {
    // Only the transcript-ready event guarantees the TRANSCRIPT file exists.
    if (event.event === "recording.transcript_completed") {
      await recordCapture(event);
    }
    // meeting.rtms_started etc. = Phase 2 — acknowledged, not yet handled.
    return Response.json({ ok: true });
  } catch (err) {
    await logActivity({
      source: "zoom",
      eventType: "zoom_webhook_error",
      severity: "error",
      summary: `Zoom webhook ${event.event} failed: ${err instanceof Error ? err.message : err}`,
    }).catch(() => {});
    // 200 so Zoom doesn't hammer retries over a persistent bug; the capture insert
    // is idempotent, so a retry would be harmless anyway.
    return Response.json({ ok: false, error: "logged" });
  }
}
