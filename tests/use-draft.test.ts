import test from "node:test";
import assert from "node:assert/strict";

import { serializeDraft, readDraft, draftAgeLabel } from "../src/lib/use-draft";

const KEY = "pwa_test_draft";

test("serializeDraft round-trips state with a savedAt stamp", () => {
  const now = 1_700_000_000_000;
  const raw = serializeDraft(KEY, { answers: { a: "1" }, idx: 2 }, now);
  const out = readDraft<{ answers: Record<string, string>; idx: number }>(KEY, raw, now, 7 * 864e5);
  assert.ok(out);
  assert.deepEqual(out!.state, { answers: { a: "1" }, idx: 2 });
  assert.equal(out!.savedAt, now);
});

test("readDraft returns null on junk JSON", () => {
  assert.equal(readDraft(KEY, "not json", Date.now(), 7 * 864e5), null);
  assert.equal(readDraft(KEY, "", Date.now(), 7 * 864e5), null);
  assert.equal(readDraft(KEY, "null", Date.now(), 7 * 864e5), null);
  assert.equal(readDraft(KEY, '{"no":"savedAt"}', Date.now(), 7 * 864e5), null);
});

test("readDraft returns null past the max age", () => {
  const saved = 1_700_000_000_000;
  const raw = serializeDraft(KEY, { idx: 1 }, saved);
  // 8 days later, default 7-day window → expired
  assert.equal(readDraft(KEY, raw, saved + 8 * 864e5, 7 * 864e5), null);
  // 6 days later → still valid
  assert.ok(readDraft(KEY, raw, saved + 6 * 864e5, 7 * 864e5));
});

test("readDraft rejects a mismatched key (stale/foreign draft)", () => {
  const raw = serializeDraft("other_key", { idx: 1 }, Date.now());
  assert.equal(readDraft(KEY, raw, Date.now(), 7 * 864e5), null);
});

test("draftAgeLabel is human and coarse", () => {
  const now = 1_700_000_000_000;
  assert.equal(draftAgeLabel(now, now), "just now");
  assert.equal(draftAgeLabel(now - 30 * 60_000, now), "30 minutes ago");
  assert.equal(draftAgeLabel(now - 3 * 3_600_000, now), "3 hours ago");
  assert.equal(draftAgeLabel(now - 2 * 864e5, now), "2 days ago");
});
