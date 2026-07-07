/**
 * Zoom webhook verification. Zoom signs every event with the app's Secret Token:
 *   x-zm-signature: v0={hex HMAC-SHA256(secret, "v0:{x-zm-request-timestamp}:{rawBody}")}
 * and gates endpoint registration with an endpoint.url_validation challenge that
 * must be answered with { plainToken, encryptedToken=hex HMAC-SHA256(secret, plainToken) }.
 * Pure functions — no DB/network — so they're unit-testable (see tests/zoom-webhook.test.ts).
 */
import crypto from "node:crypto";

/** hex HMAC-SHA256(secret, message). */
function hmacHex(secret: string, message: string): string {
  return crypto.createHmac("sha256", secret).update(message).digest("hex");
}

/**
 * Verify an inbound webhook's signature. Returns false on any missing/malformed
 * input (never throws) so the route can respond 400 cleanly.
 */
export function verifyZoomSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string,
): boolean {
  if (!signature || !timestamp || !secret) return false;
  const expected = `v0=${hmacHex(secret, `v0:${timestamp}:${rawBody}`)}`;
  // Compare as bytes: `signature` is attacker-controlled, and timingSafeEqual throws
  // on unequal BYTE lengths — a String.length guard passes for a multibyte char that
  // yields a longer Buffer, so guard on the actual buffers to keep this from throwing.
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

/** Build the endpoint.url_validation response body. */
export function urlValidationResponse(plainToken: string, secret: string): { plainToken: string; encryptedToken: string } {
  return { plainToken, encryptedToken: hmacHex(secret, plainToken) };
}

// ── Event payload shapes (only the fields we consume) ────────────────────────

export type ZoomRecordingFile = {
  id?: string;
  file_type?: string; // "TRANSCRIPT" | "MP4" | "M4A" | "CHAT" | …
  file_extension?: string;
  download_url?: string;
  recording_type?: string;
  status?: string;
};

export type ZoomRecordingObject = {
  uuid: string;
  id?: number;
  topic?: string;
  host_id: string;
  host_email?: string;
  start_time?: string;
  recording_files?: ZoomRecordingFile[];
};

export type ZoomRecordingPayload = {
  account_id?: string;
  object: ZoomRecordingObject;
};

export type ZoomWebhookEvent = {
  event: string;
  event_ts?: number;
  // Present on recording.* events; a short-lived bearer for downloading the files.
  download_token?: string;
  payload: { plainToken?: string } & Partial<ZoomRecordingPayload>;
};
