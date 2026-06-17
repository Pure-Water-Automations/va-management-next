import test from "node:test";
import assert from "node:assert/strict";

import {
  averageScore,
  combinedScore,
  nextStatus,
  autoRecommendation,
  rubricCategories,
} from "../src/lib/services/evaluation-rubric";

test("averageScore means the trainee rubric categories", () => {
  const scores = { sop_adherence: 4, loom: 4, notion_ssot: 5, drive: 4, communication: 5, reliability: 4 };
  assert.equal(averageScore("TRAINEE", scores), 4.33);
});

test("averageScore ignores missing categories but requires at least one", () => {
  assert.equal(averageScore("TIER", { reliability: 4, quality: 2 }), 3);
  assert.throws(() => averageScore("TIER", {}), /No rubric scores/);
});

test("averageScore rejects out-of-range scores", () => {
  assert.throws(() => averageScore("TRAINEE", { communication: 6 }), /Invalid score/);
  assert.throws(() => averageScore("TRAINEE", { communication: 0 }), /Invalid score/);
});

test("combinedScore weights supervisor 0.6 and self 0.4", () => {
  assert.equal(combinedScore(3, 5), 4.2); // 0.6*5 + 0.4*3 = 4.2
});

test("combinedScore falls back to whichever side submitted", () => {
  assert.equal(combinedScore(4, null), 4);
  assert.equal(combinedScore(null, 2), 2);
  assert.equal(combinedScore(null, null), null);
});

test("nextStatus reflects which submissions are in", () => {
  assert.equal(nextStatus({ selfSubmitted: false, supervisorSubmitted: false }), "forms_sent");
  assert.equal(nextStatus({ selfSubmitted: true, supervisorSubmitted: false }), "self_submitted");
  assert.equal(nextStatus({ selfSubmitted: false, supervisorSubmitted: true }), "supervisor_submitted");
  assert.equal(nextStatus({ selfSubmitted: true, supervisorSubmitted: true }), "ready_for_review");
});

test("autoRecommendation: trainee guardrail extends training when a core behaviour is weak", () => {
  // High average but reliability is a 2 → must extend, not promote.
  const rec = autoRecommendation({
    kind: "TRAINEE",
    combined: 4.5,
    supervisorScores: { sop_adherence: 5, loom: 5, notion_ssot: 5, drive: 5, communication: 5, reliability: 2 },
  });
  assert.equal(rec, "extend_training");
});

test("autoRecommendation: strong trainee with no weak core behaviours promotes", () => {
  const rec = autoRecommendation({
    kind: "TRAINEE",
    combined: 4.2,
    supervisorScores: { sop_adherence: 4, loom: 4, notion_ssot: 4, drive: 4, communication: 5, reliability: 4 },
  });
  assert.equal(rec, "promote");
});

test("autoRecommendation: explicit needs_improvement overrides a passing average", () => {
  assert.equal(
    autoRecommendation({ kind: "TIER", combined: 4.5, supervisorRecommendation: "needs_improvement" }),
    "hold",
  );
  assert.equal(
    autoRecommendation({ kind: "TRAINEE", combined: 4.5, supervisorScores: { communication: 5, notion_ssot: 5, drive: 5, reliability: 5 }, supervisorRecommendation: "needs_improvement" }),
    "extend_training",
  );
});

test("autoRecommendation: pending until a combined score exists", () => {
  assert.equal(autoRecommendation({ kind: "TRAINEE", combined: null }), "pending");
});

test("autoRecommendation: mid-range holds", () => {
  assert.equal(autoRecommendation({ kind: "TIER", combined: 3.2 }), "hold");
});

test("rubricCategories returns the right set", () => {
  assert.deepEqual(rubricCategories("TRAINEE").map((c) => c.key), [
    "sop_adherence", "loom", "notion_ssot", "drive", "communication", "reliability",
  ]);
  assert.deepEqual(rubricCategories("TIER").map((c) => c.key), [
    "reliability", "communication", "quality", "independence", "standards", "contribution",
  ]);
});
