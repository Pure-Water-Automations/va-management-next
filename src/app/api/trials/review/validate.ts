// PWA Skills Trial — gate-review validation (pure, unit-testable).
//
// This is the single source of truth for the gate decision rules. The route
// (src/app/api/trials/review/route.ts) enforces it server-side; the reviewer
// Decision Panel imports it to mirror the same rule client-side so unmet
// criteria surface inline before submit. Keep it free of Prisma/IO so it can
// be exercised by `node --test` with no live DB (see tests/trial-gate.test.ts).

import type {
  CandidateStage,
  FinalDecision,
  GateResult,
  TrialStatus,
} from "@prisma/client";
import {
  PASS_MIN_CORE_SCORE,
  PASS_MIN_TOTAL,
  RUBRIC_DIMENSIONS,
  rubricTotal,
  type GateDecision,
  type GateReviewRequest,
  type RubricScores,
} from "@/lib/trial/types";

export const GATE_DECISIONS: readonly GateDecision[] = [
  "pass",
  "revision",
  "waitlist",
  "close",
];

/** Context the route resolves from the DB before validating a pass. */
export interface GateReviewContext {
  // True when at least one HUMAN_ESCALATED event has no human reply after it in
  // the Human conversation — a critical flag that blocks a pass (doc 13 §2).
  hasUnresolvedEscalation: boolean;
}

/** Downstream persistence effects of a decision (all pure, no IO). */
export interface GateTransition {
  newStage: CandidateStage;
  trialStatus: TrialStatus;
  // Set on outcomes that record a hiring decision; null when unchanged.
  finalDecision: FinalDecision | null;
  // Set to "pass" on a pass so the 10-hr gate result mirrors legacy behavior.
  tenhrGateResult: GateResult | null;
}

export interface GateReviewValidation {
  valid: boolean;
  errors: string[];
  // Non-null only when valid — the exact stage/status writes the route applies.
  transition: GateTransition | null;
}

/**
 * Map a decision to its stage + status transitions (doc 13 §3):
 *   pass     → tenhr_pass  (COMPLETED, tenhrGateResult "pass")
 *   revision → tenhr_in_progress (REVISION — candidate keeps working)
 *   waitlist → decision   (COMPLETED, finalDecision "waitlist")
 *   close    → closed      (COMPLETED, finalDecision "reject")
 */
export function gateTransition(decision: GateDecision): GateTransition {
  switch (decision) {
    case "pass":
      return {
        newStage: "tenhr_pass",
        trialStatus: "COMPLETED",
        finalDecision: null,
        tenhrGateResult: "pass",
      };
    case "revision":
      return {
        newStage: "tenhr_in_progress",
        trialStatus: "REVISION",
        finalDecision: null,
        tenhrGateResult: null,
      };
    case "waitlist":
      return {
        newStage: "decision",
        trialStatus: "COMPLETED",
        finalDecision: "waitlist",
        tenhrGateResult: null,
      };
    case "close":
      return {
        newStage: "closed",
        trialStatus: "COMPLETED",
        finalDecision: "reject",
        tenhrGateResult: null,
      };
  }
}

function isValidScore(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= 5;
}

/**
 * Validate a gate review. Enforced server-side (never trust the UI). Rules:
 *  - decision must be one of the four gate decisions
 *  - rationale non-empty
 *  - ALL 7 rubric dimensions scored as an integer 1–5
 *  - decision "pass" additionally requires: weighted total ≥ 75, every core
 *    dimension ≥ 3, and no unresolved critical escalation flag
 * revision / waitlist / close still require a rationale + all 7 scores, but are
 * not held to the pass thresholds.
 */
export function validateGateReview(
  input: GateReviewRequest,
  context: GateReviewContext,
): GateReviewValidation {
  const errors: string[] = [];

  if (!GATE_DECISIONS.includes(input.decision)) {
    errors.push(`Invalid decision: ${String(input.decision)}.`);
  }

  if (typeof input.rationale !== "string" || input.rationale.trim() === "") {
    errors.push("A written, evidence-based rationale is required.");
  }

  const scores = (input.rubricScores ?? {}) as Partial<RubricScores>;
  for (const d of RUBRIC_DIMENSIONS) {
    if (!isValidScore(scores[d.key])) {
      errors.push(`Score “${d.label}” must be set (1–5).`);
    }
  }
  const allScored = RUBRIC_DIMENSIONS.every((d) => isValidScore(scores[d.key]));

  if (input.decision === "pass") {
    if (allScored) {
      const total = rubricTotal(scores as RubricScores);
      if (total < PASS_MIN_TOTAL) {
        errors.push(
          `Weighted total ${total.toFixed(1)} is below the ${PASS_MIN_TOTAL} pass threshold.`,
        );
      }
      for (const d of RUBRIC_DIMENSIONS) {
        if (d.core && (scores[d.key] as number) < PASS_MIN_CORE_SCORE) {
          errors.push(
            `Core dimension “${d.label}” is below the minimum of ${PASS_MIN_CORE_SCORE}.`,
          );
        }
      }
    }
    if (context.hasUnresolvedEscalation) {
      errors.push(
        "An unresolved human escalation must be answered before passing.",
      );
    }
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    transition: valid ? gateTransition(input.decision) : null,
  };
}
