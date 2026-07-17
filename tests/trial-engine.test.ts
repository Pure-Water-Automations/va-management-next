import assert from "node:assert/strict";
import test from "node:test";
import type { MissionStatus } from "@prisma/client";
import {
  calculateTimerDelta,
  canTransitionMission,
  currentTrialDay,
  resolveFinalMissionStatus,
  shouldResetMissionForRevision,
  stripHiddenTargets,
} from "../src/lib/trial/engine";
import type { AiEvaluationProposal } from "../src/lib/trial/types";

test("mission state machine permits only Appendix B transitions", () => {
  const statuses: MissionStatus[] = [
    "NOT_STARTED",
    "IN_PROGRESS",
    "SUBMITTED",
    "NEEDS_REVISION",
    "APPROVED",
  ];
  const legal = new Set([
    "NOT_STARTED:IN_PROGRESS",
    "IN_PROGRESS:SUBMITTED",
    "SUBMITTED:APPROVED",
    "SUBMITTED:NEEDS_REVISION",
    "NEEDS_REVISION:IN_PROGRESS",
  ]);
  for (const from of statuses) {
    for (const to of statuses) {
      assert.equal(canTransitionMission(from, to), legal.has(`${from}:${to}`), `${from} -> ${to}`);
    }
  }
});

test("server timer delta ignores negative time and caps one interval at six hours", () => {
  const start = new Date("2026-07-11T10:00:00.000Z");
  assert.equal(calculateTimerDelta(start, new Date("2026-07-11T10:01:40.900Z")), 100);
  assert.equal(calculateTimerDelta(start, new Date("2026-07-11T09:00:00.000Z")), 0);
  assert.equal(calculateTimerDelta(start, new Date("2026-07-12T10:00:00.000Z")), 21_600);
});

test("current day is based on candidate-local calendar boundaries", () => {
  const start = new Date("2026-07-11T15:30:00.000Z"); // 23:30 on Jul 11 at GMT+8
  assert.equal(currentTrialDay(start, "GMT+8 — Manila", new Date("2026-07-11T15:59:59.000Z")), 1);
  assert.equal(currentTrialDay(start, "GMT+8 — Manila", new Date("2026-07-11T16:00:00.000Z")), 2);
  assert.equal(currentTrialDay(start, "GMT+8 — Manila", new Date("2026-07-13T16:00:00.000Z")), 4);
});

test("hidden evaluation targets are stripped recursively without mutating content", () => {
  const content = {
    clientBrief: "Visible",
    hiddenTargets: ["secret"],
    nested: { visible: true, hiddenTargets: ["also secret"] },
  };
  assert.deepEqual(stripHiddenTargets(content), {
    clientBrief: "Visible",
    nested: { visible: true },
  });
  assert.deepEqual(content.hiddenTargets, ["secret"]);
});

// A1 — auto-approve on submit for the 5 non-graded mission kinds -----------

const SAMPLE_FEEDBACK = { obs: "o", impact: "i", sugg: "s", enc: "e" };

test("a submission with no AI proposal (tour/branch/sop/meet/reflect) auto-approves", () => {
  // These 5 kinds never produce a proposal in submitStep (only learn/sim do),
  // so `proposal` is null for them — this is the exact input auto-approval
  // must handle for those kinds to ever reach APPROVED.
  assert.equal(resolveFinalMissionStatus(null), "APPROVED");
});

test("learn/sim keep their existing grading when a proposal is present", () => {
  const approved: AiEvaluationProposal = { approved: true, feedback: SAMPLE_FEEDBACK };
  const rejected: AiEvaluationProposal = { approved: false, feedback: SAMPLE_FEEDBACK };
  assert.equal(resolveFinalMissionStatus(approved), "APPROVED");
  assert.equal(resolveFinalMissionStatus(rejected), "NEEDS_REVISION");
});

test("a full 9-mission trial (2 graded steps + 7 auto-approved non-graded steps) reaches all-APPROVED", () => {
  // Mirrors markEvidenceReadyIfComplete's own completion check
  // (`count(status != APPROVED) === 0`) without needing a live DB: if every
  // mission's finalStatus resolves to APPROVED, the remaining count is 0 and
  // the trial flips to SUBMITTED + trainingReadyForReview.
  const proposals: (AiEvaluationProposal | null)[] = [
    { approved: true, feedback: SAMPLE_FEEDBACK }, // learn
    { approved: true, feedback: SAMPLE_FEEDBACK }, // sim
    null, null, null, null, null, null, null, // 7 non-graded steps across tour/branch/sop/meet/reflect
  ];
  assert.equal(proposals.length, 9);
  const statuses = proposals.map(resolveFinalMissionStatus);
  const remaining = statuses.filter((status) => status !== "APPROVED").length;
  assert.equal(remaining, 0, "all 9 missions must resolve to APPROVED for evidence-ready to fire");
});

test("a single NEEDS_REVISION among the 9 keeps evidence not-ready", () => {
  const proposals: (AiEvaluationProposal | null)[] = [
    { approved: false, feedback: SAMPLE_FEEDBACK }, // learn failed the scenario check
    { approved: true, feedback: SAMPLE_FEEDBACK },
    null, null, null, null, null, null, null,
  ];
  const statuses = proposals.map(resolveFinalMissionStatus);
  const remaining = statuses.filter((status) => status !== "APPROVED").length;
  assert.equal(remaining, 1);
});

// A1 — reviewer "revision" gate decision resets missions --------------------

test("revision reset targets APPROVED and SUBMITTED missions only", () => {
  const statuses: MissionStatus[] = ["NOT_STARTED", "IN_PROGRESS", "SUBMITTED", "NEEDS_REVISION", "APPROVED"];
  const reset = new Set(statuses.filter(shouldResetMissionForRevision));
  assert.deepEqual(reset, new Set(["SUBMITTED", "APPROVED"]));
});

test("revision reset is idempotent — a mission already NEEDS_REVISION is left alone", () => {
  assert.equal(shouldResetMissionForRevision("NEEDS_REVISION"), false);
});
