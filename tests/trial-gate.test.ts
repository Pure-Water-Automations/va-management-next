import { test } from "node:test";
import assert from "node:assert/strict";
import {
  gateTransition,
  validateGateReview,
  type GateReviewContext,
} from "../src/app/api/trials/review/validate";
import type { GateReviewRequest, RubricScores } from "../src/lib/trial/types";
import { rubricTotal } from "../src/lib/trial/types";

const CLEAN: GateReviewContext = { hasUnresolvedEscalation: false };

// A comfortably-passing score set: all 5s → weighted total 100, every core ≥ 3.
const PASSING: RubricScores = {
  rel: 5,
  comm: 5,
  acc: 5,
  own: 5,
  sys: 5,
  scout: 5,
  spec: 5,
};

function req(overrides: Partial<GateReviewRequest> = {}): GateReviewRequest {
  return {
    candidateId: "cand_1",
    decision: "pass",
    rationale: "Strong reliability, clean escalations, and thorough revisions.",
    rubricScores: { ...PASSING },
    ...overrides,
  };
}

// ── Pass path ──────────────────────────────────────────────────────────────

test("pass allowed when all criteria are met", () => {
  const r = validateGateReview(req(), CLEAN);
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, []);
  assert.equal(r.transition?.newStage, "tenhr_pass");
  assert.equal(r.transition?.trialStatus, "COMPLETED");
  assert.equal(r.transition?.tenhrGateResult, "pass");
});

test("pass blocked when a dimension is unscored", () => {
  const scores = { ...PASSING } as Record<string, number>;
  delete scores.acc;
  const r = validateGateReview(
    req({ rubricScores: scores as RubricScores }),
    CLEAN,
  );
  assert.equal(r.valid, false);
  assert.equal(r.transition, null);
  assert.ok(r.errors.some((e) => /Instructions & Accuracy/.test(e)));
});

test("pass blocked when a dimension is out of the 1–5 range", () => {
  const r = validateGateReview(
    req({ rubricScores: { ...PASSING, comm: 0 } }),
    CLEAN,
  );
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /Communication & Escalation/.test(e)));
});

test("pass blocked when rationale is empty", () => {
  const r = validateGateReview(req({ rationale: "   " }), CLEAN);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /rationale is required/i.test(e)));
});

test("pass blocked when weighted total is below 75", () => {
  // All 3s → 60/100: full scores, but under threshold.
  const low: RubricScores = { rel: 3, comm: 3, acc: 3, own: 3, sys: 3, scout: 3, spec: 3 };
  assert.ok(rubricTotal(low) < 75);
  const r = validateGateReview(req({ rubricScores: low }), CLEAN);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /below the 75 pass threshold/.test(e)));
});

test("pass blocked when a core dimension is below 3 (even if total ≥ 75)", () => {
  // rel=2 (core), everything else 5 → total = 0.4*20 + 80 = 88 ≥ 75, but core fails.
  const scores: RubricScores = { ...PASSING, rel: 2 };
  assert.ok(rubricTotal(scores) >= 75);
  const r = validateGateReview(req({ rubricScores: scores }), CLEAN);
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /Reliability & Commitments.*below the minimum of 3/.test(e)));
});

test("pass blocked when a non-core dimension below 3 does NOT trip the core rule", () => {
  // sys=1 (non-core). Keep total ≥ 75: 0.2*10 + rest. total = 90 - 8 = ... compute.
  const scores: RubricScores = { ...PASSING, sys: 1 };
  const total = rubricTotal(scores); // 100 - (4/5*10) = 92
  assert.ok(total >= 75);
  const r = validateGateReview(req({ rubricScores: scores }), CLEAN);
  // No core-minimum error for the non-core sys dimension.
  assert.equal(r.valid, true);
});

test("pass blocked by an unresolved human escalation", () => {
  const r = validateGateReview(req(), { hasUnresolvedEscalation: true });
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /unresolved human escalation/i.test(e)));
});

// ── Non-pass decisions ───────────────────────────────────────────────────────

test("revision allowed without pass thresholds but still needs full scores + rationale", () => {
  const low: RubricScores = { rel: 1, comm: 1, acc: 1, own: 1, sys: 1, scout: 1, spec: 1 };
  const r = validateGateReview(
    req({ decision: "revision", rubricScores: low }),
    CLEAN,
  );
  assert.equal(r.valid, true);
  assert.equal(r.transition?.newStage, "tenhr_in_progress");
  assert.equal(r.transition?.trialStatus, "REVISION");
});

test("revision still requires a rationale", () => {
  const r = validateGateReview(
    req({ decision: "revision", rationale: "" }),
    CLEAN,
  );
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /rationale is required/i.test(e)));
});

test("revision still requires all 7 scores", () => {
  const scores = { ...PASSING } as Record<string, number>;
  delete scores.spec;
  const r = validateGateReview(
    req({ decision: "revision", rubricScores: scores as RubricScores }),
    CLEAN,
  );
  assert.equal(r.valid, false);
});

test("revision is NOT blocked by an unresolved escalation", () => {
  const low: RubricScores = { rel: 1, comm: 1, acc: 1, own: 1, sys: 1, scout: 1, spec: 1 };
  const r = validateGateReview(
    req({ decision: "revision", rubricScores: low }),
    { hasUnresolvedEscalation: true },
  );
  assert.equal(r.valid, true);
});

test("waitlist allowed below threshold; maps to decision + waitlist", () => {
  const low: RubricScores = { rel: 2, comm: 2, acc: 2, own: 2, sys: 2, scout: 2, spec: 2 };
  const r = validateGateReview(
    req({ decision: "waitlist", rubricScores: low }),
    CLEAN,
  );
  assert.equal(r.valid, true);
  assert.equal(r.transition?.newStage, "decision");
  assert.equal(r.transition?.trialStatus, "COMPLETED");
  assert.equal(r.transition?.finalDecision, "waitlist");
});

test("close allowed below threshold; maps to closed + reject", () => {
  const low: RubricScores = { rel: 1, comm: 1, acc: 1, own: 1, sys: 1, scout: 1, spec: 1 };
  const r = validateGateReview(
    req({ decision: "close", rubricScores: low }),
    CLEAN,
  );
  assert.equal(r.valid, true);
  assert.equal(r.transition?.newStage, "closed");
  assert.equal(r.transition?.trialStatus, "COMPLETED");
  assert.equal(r.transition?.finalDecision, "reject");
});

test("waitlist / close still require rationale + full scores", () => {
  for (const decision of ["waitlist", "close"] as const) {
    const noRationale = validateGateReview(req({ decision, rationale: "" }), CLEAN);
    assert.equal(noRationale.valid, false, `${decision} needs rationale`);
    const scores = { ...PASSING } as Record<string, number>;
    delete scores.rel;
    const missing = validateGateReview(
      req({ decision, rubricScores: scores as RubricScores }),
      CLEAN,
    );
    assert.equal(missing.valid, false, `${decision} needs full scores`);
  }
});

test("invalid decision string is rejected", () => {
  const r = validateGateReview(
    req({ decision: "maybe" as unknown as GateReviewRequest["decision"] }),
    CLEAN,
  );
  assert.equal(r.valid, false);
  assert.ok(r.errors.some((e) => /Invalid decision/.test(e)));
});

// ── Stage mapping (pure) ─────────────────────────────────────────────────────

test("gateTransition maps every decision correctly", () => {
  assert.deepEqual(gateTransition("pass"), {
    newStage: "tenhr_pass",
    trialStatus: "COMPLETED",
    finalDecision: null,
    tenhrGateResult: "pass",
  });
  assert.deepEqual(gateTransition("revision"), {
    newStage: "tenhr_in_progress",
    trialStatus: "REVISION",
    finalDecision: null,
    tenhrGateResult: null,
  });
  assert.deepEqual(gateTransition("waitlist"), {
    newStage: "decision",
    trialStatus: "COMPLETED",
    finalDecision: "waitlist",
    tenhrGateResult: null,
  });
  assert.deepEqual(gateTransition("close"), {
    newStage: "closed",
    trialStatus: "COMPLETED",
    finalDecision: "reject",
    tenhrGateResult: null,
  });
});
