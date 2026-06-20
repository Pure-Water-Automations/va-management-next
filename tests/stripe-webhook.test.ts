import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifyStripeSignature } from "../src/lib/sales/stripe-webhook";

const SECRET = "whsec_test";

function sign(payload: string, t: number, secret = SECRET): string {
  const v1 = createHmac("sha256", secret).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${v1}`;
}

test("verifyStripeSignature accepts a valid, fresh signature", () => {
  const payload = JSON.stringify({ type: "invoice.paid" });
  const now = 1_900_000_000;
  assert.equal(verifyStripeSignature(payload, sign(payload, now), SECRET, { nowSec: now }), true);
});

test("verifyStripeSignature rejects a tampered payload", () => {
  const payload = JSON.stringify({ type: "invoice.paid" });
  const now = 1_900_000_000;
  const header = sign(payload, now);
  assert.equal(verifyStripeSignature(payload + "x", header, SECRET, { nowSec: now }), false);
});

test("verifyStripeSignature rejects the wrong secret", () => {
  const payload = "{}";
  const now = 1_900_000_000;
  assert.equal(verifyStripeSignature(payload, sign(payload, now, "whsec_other"), SECRET, { nowSec: now }), false);
});

test("verifyStripeSignature rejects an expired timestamp", () => {
  const payload = "{}";
  const t = 1_900_000_000;
  const header = sign(payload, t);
  assert.equal(verifyStripeSignature(payload, header, SECRET, { nowSec: t + 10_000, toleranceSec: 300 }), false);
});

test("verifyStripeSignature rejects missing header/secret", () => {
  assert.equal(verifyStripeSignature("{}", null, SECRET), false);
  assert.equal(verifyStripeSignature("{}", "t=1,v1=abc", ""), false);
});
