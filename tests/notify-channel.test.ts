import test from "node:test";
import assert from "node:assert/strict";

import { channelDecision, normalizePhone, toApiNumber } from "../src/lib/notify-channel";

test("channelDecision: default (both) with number + configured → email + whatsapp", () => {
  assert.deepEqual(channelDecision("both", true, true), { email: true, whatsapp: true });
  assert.deepEqual(channelDecision(null, true, true), { email: true, whatsapp: true });
});

test("channelDecision: whatsapp falls back to email-only when not viable", () => {
  // opted into both but no number on file
  assert.deepEqual(channelDecision("both", false, true), { email: true, whatsapp: false });
  // opted into both but integration not configured
  assert.deepEqual(channelDecision("both", true, false), { email: true, whatsapp: false });
  // whatsapp-only but no number → nothing actually sends on whatsapp (email also off)
  assert.deepEqual(channelDecision("whatsapp", false, true), { email: false, whatsapp: false });
});

test("channelDecision: explicit channels", () => {
  assert.deepEqual(channelDecision("email", true, true), { email: true, whatsapp: false });
  assert.deepEqual(channelDecision("whatsapp", true, true), { email: false, whatsapp: true });
  assert.deepEqual(channelDecision("none", true, true), { email: false, whatsapp: false });
  // digest → no immediate send (the daily notification-digest email handles it)
  assert.deepEqual(channelDecision("digest", true, true), { email: false, whatsapp: false });
});

test("normalizePhone: strips formatting, stores +digits, rejects junk", () => {
  assert.equal(normalizePhone("+63 917 123 4567"), "+639171234567");
  assert.equal(normalizePhone("0639171234567"), "+0639171234567"); // keeps digits as given
  assert.equal(normalizePhone("(650) 555-1234"), "+6505551234");
  assert.equal(normalizePhone("123"), null); // too short
  assert.equal(normalizePhone(""), null);
  assert.equal(normalizePhone(null), null);
});

test("toApiNumber: bare digits for the Meta API", () => {
  assert.equal(toApiNumber("+639171234567"), "639171234567");
  assert.equal(toApiNumber(null), "");
});
