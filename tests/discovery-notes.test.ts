import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDiscoveryNotes, notesHaveContent, BUYING_SIGNALS } from "../src/lib/discovery-notes";

test("normalizeDiscoveryNotes trims, caps, and validates enums", () => {
  const n = normalizeDiscoveryNotes({
    currentSituation: "  drowning in admin  ",
    buyingSignals: "HOT",
    decisionProcess: "wizard", // invalid -> ""
    followUpDate: "2026-07-10",
    recommendedPackage: "x".repeat(500),
    nextStep: "send proposal",
  });
  assert.equal(n.currentSituation, "drowning in admin");
  assert.equal(n.buyingSignals, "hot");
  assert.equal(n.decisionProcess, "");
  assert.equal(n.followUpDate, "2026-07-10");
  assert.equal(n.recommendedPackage.length, 200); // capped
  assert.equal(n.nextStep, "send proposal");
});

test("normalizeDiscoveryNotes rejects a non-ISO follow-up date", () => {
  assert.equal(normalizeDiscoveryNotes({ followUpDate: "next tuesday" }).followUpDate, "");
  assert.equal(normalizeDiscoveryNotes({ followUpDate: "07/10/2026" }).followUpDate, "");
});

test("notesHaveContent is false for an empty capture, true once anything is set", () => {
  assert.equal(notesHaveContent(normalizeDiscoveryNotes({})), false);
  assert.equal(notesHaveContent(normalizeDiscoveryNotes({ painPoints: "scheduling chaos" })), true);
});

test("buying-signal options are the expected ladder", () => {
  assert.deepEqual([...BUYING_SIGNALS], ["cold", "curious", "warm", "hot"]);
});
