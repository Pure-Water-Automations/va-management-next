/**
 * Trainee / tier evaluation rubric — pure scoring logic (no DB, no I/O).
 *
 * Replaces the legacy GAS Evaluation.gs scoring helpers (evalCollectScores_,
 * evalRecomputeStatus_, evalAutoRecommendation_, the 0.6/0.4 combined formula).
 * A trainee evaluation pairs a VA self-assessment with a supervisor assessment;
 * HR reads the combined score + an auto-recommendation, then approves/declines.
 */

export type RubricKind = "TRAINEE" | "TIER";

export type RubricCategory = { key: string; label: string };

/** Trainee checkpoint rubric (TRAINEE → TIER_1). */
export const TRAINEE_RUBRIC: readonly RubricCategory[] = [
  { key: "sop_adherence", label: "SOP adherence" },
  { key: "loom", label: "Loom updates & walkthroughs" },
  { key: "notion_ssot", label: "Notion as source of truth" },
  { key: "drive", label: "Drive hygiene" },
  { key: "communication", label: "Communication standards" },
  { key: "reliability", label: "Reliability & time tracking" },
];

/** Tier-advancement rubric (TIER_n → TIER_n+1). */
export const TIER_RUBRIC: readonly RubricCategory[] = [
  { key: "reliability", label: "Reliability & follow-through" },
  { key: "communication", label: "Communication & responsiveness" },
  { key: "quality", label: "Quality & accuracy of work" },
  { key: "independence", label: "Independence & initiative" },
  { key: "standards", label: "Standards & tools adherence" },
  { key: "contribution", label: "Systems & team contribution" },
];

export const SCORE_MIN = 1;
export const SCORE_MAX = 5;

/** Supervisor recommendation values (free of the score, an explicit verdict). */
export const SUPERVISOR_RECOMMENDATIONS = ["promote", "hold", "needs_improvement"] as const;
export type SupervisorRecommendation = (typeof SUPERVISOR_RECOMMENDATIONS)[number];

export function rubricCategories(kind: RubricKind): readonly RubricCategory[] {
  return kind === "TRAINEE" ? TRAINEE_RUBRIC : TIER_RUBRIC;
}

/** Mean of the rubric category scores (1–5). Throws on out-of-range or empty. */
export function averageScore(kind: RubricKind, scores: Record<string, number>): number {
  const cats = rubricCategories(kind);
  let sum = 0;
  let n = 0;
  for (const cat of cats) {
    const v = scores[cat.key];
    if (v === undefined || v === null) continue;
    if (!Number.isFinite(v) || v < SCORE_MIN || v > SCORE_MAX) {
      throw new Error(`Invalid score for ${cat.key}: ${v} (must be ${SCORE_MIN}–${SCORE_MAX})`);
    }
    sum += v;
    n += 1;
  }
  if (n === 0) throw new Error("No rubric scores provided.");
  return round2(sum / n);
}

/**
 * Combined score: weight the supervisor's view at 0.6 and the VA self-view at
 * 0.4. If only one side has submitted, use that side. Null if neither has.
 */
export function combinedScore(
  selfScore: number | null | undefined,
  supervisorScore: number | null | undefined,
): number | null {
  const hasSelf = typeof selfScore === "number" && Number.isFinite(selfScore);
  const hasSup = typeof supervisorScore === "number" && Number.isFinite(supervisorScore);
  if (hasSelf && hasSup) return round2(0.6 * (supervisorScore as number) + 0.4 * (selfScore as number));
  if (hasSup) return round2(supervisorScore as number);
  if (hasSelf) return round2(selfScore as number);
  return null;
}

export type EvalStatusValue =
  | "forms_sent"
  | "self_submitted"
  | "supervisor_submitted"
  | "ready_for_review"
  | "approved"
  | "declined";

/**
 * Status from the two submissions. Decided states (approved/declined) are
 * terminal and set elsewhere; this only covers the data-collection phase.
 */
export function nextStatus(opts: {
  selfSubmitted: boolean;
  supervisorSubmitted: boolean;
}): EvalStatusValue {
  if (opts.selfSubmitted && opts.supervisorSubmitted) return "ready_for_review";
  if (opts.supervisorSubmitted) return "supervisor_submitted";
  if (opts.selfSubmitted) return "self_submitted";
  return "forms_sent";
}

/**
 * Auto-recommendation surfaced to HR (advisory only — HR still decides).
 * Trainee guardrail mirrors the legacy rule: if any of the four core
 * behaviours (communication, notion_ssot, drive, reliability) is weak (≤2) on
 * the supervisor's scoring, recommend extending training regardless of average.
 */
export function autoRecommendation(opts: {
  kind: RubricKind;
  combined: number | null;
  supervisorScores?: Record<string, number> | null;
  supervisorRecommendation?: SupervisorRecommendation | null;
}): "promote" | "hold" | "extend_training" | "pending" {
  if (opts.combined === null) return "pending";

  if (opts.kind === "TRAINEE" && opts.supervisorScores) {
    const core = ["communication", "notion_ssot", "drive", "reliability"];
    const weak = core.some((k) => {
      const v = opts.supervisorScores?.[k];
      return typeof v === "number" && v <= 2;
    });
    if (weak) return "extend_training";
  }

  if (opts.supervisorRecommendation === "needs_improvement") {
    return opts.kind === "TRAINEE" ? "extend_training" : "hold";
  }

  if (opts.combined >= 4) return "promote";
  if (opts.combined >= 3) return "hold";
  return opts.kind === "TRAINEE" ? "extend_training" : "hold";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
