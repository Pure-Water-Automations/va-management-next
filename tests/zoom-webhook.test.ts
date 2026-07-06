import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyZoomSignature, urlValidationResponse } from "../src/lib/zoom/webhook";

const SECRET = "test_secret_token";
const sign = (ts: string, body: string) =>
  `v0=${createHmac("sha256", SECRET).update(`v0:${ts}:${body}`).digest("hex")}`;

test("verifyZoomSignature: accepts a correctly signed body", () => {
  const ts = "1700000000";
  const body = JSON.stringify({ event: "recording.transcript_completed" });
  assert.equal(verifyZoomSignature(body, sign(ts, body), ts, SECRET), true);
});

test("verifyZoomSignature: rejects a tampered body", () => {
  const ts = "1700000000";
  const body = JSON.stringify({ event: "recording.transcript_completed" });
  const sig = sign(ts, body); // signature for the original body
  assert.equal(verifyZoomSignature(`${body} `, sig, ts, SECRET), false);
});

test("verifyZoomSignature: rejects the wrong secret", () => {
  const ts = "1700000000";
  const body = "{}";
  const sig = `v0=${createHmac("sha256", "other_secret").update(`v0:${ts}:${body}`).digest("hex")}`;
  assert.equal(verifyZoomSignature(body, sig, ts, SECRET), false);
});

test("verifyZoomSignature: false on missing signature or timestamp", () => {
  assert.equal(verifyZoomSignature("{}", null, "1", SECRET), false);
  assert.equal(verifyZoomSignature("{}", "v0=deadbeef", null, SECRET), false);
});

test("urlValidationResponse: encryptedToken is hex HMAC-SHA256(secret, plainToken)", () => {
  const plainToken = "abc123XYZ";
  const res = urlValidationResponse(plainToken, SECRET);
  assert.equal(res.plainToken, plainToken);
  assert.equal(res.encryptedToken, createHmac("sha256", SECRET).update(plainToken).digest("hex"));
});
