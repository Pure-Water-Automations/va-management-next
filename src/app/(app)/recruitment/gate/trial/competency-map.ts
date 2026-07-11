// Pure mapping from TrialEvent type → the competencies / rubric dimensions it
// is evidence for. Used by the Competency Evidence Explorer (doc 04's 6-part
// taxonomy) and by the rubric panel's per-dimension evidence counts (doc 12's
// 7 weighted dimensions). No IO — keep it a plain lookup so it stays trivial to
// reason about and reuse.

import { TRIAL_EVENTS, type TrialEventType } from "@/lib/trial/events";
import { RUBRIC_DIMENSIONS, type RubricKey } from "@/lib/trial/types";

// ── The 6 operational competencies (docs/skills-trial/04 §1) ────────────────

export const COMPETENCIES = [
  { key: "rel", label: "Reliability & Commitments" },
  { key: "comm", label: "Communication & Escalation" },
  { key: "own", label: "Ownership & Recovery" },
  { key: "coach", label: "Coachability & Feedback Response" },
  { key: "sys", label: "Systems Thinking (Systems Scout)" },
  { key: "prof", label: "Professionalism & Integrity" },
] as const;

export type CompetencyKey = (typeof COMPETENCIES)[number]["key"];

export const COMPETENCY_LABEL: Record<CompetencyKey, string> = COMPETENCIES.reduce(
  (acc, c) => {
    acc[c.key] = c.label;
    return acc;
  },
  {} as Record<CompetencyKey, string>,
);

// Event type → competencies it provides evidence for. An event may inform more
// than one; purely mechanical/system events map to none.
const COMPETENCY_MAP: Record<TrialEventType, CompetencyKey[]> = {
  [TRIAL_EVENTS.TRIAL_ACKNOWLEDGED]: ["rel"],
  [TRIAL_EVENTS.CHECKIN_REQUESTED]: [],
  [TRIAL_EVENTS.CHECKIN_SUBMITTED]: ["rel", "comm"],
  [TRIAL_EVENTS.CHECKIN_REMINDED]: ["rel"],
  [TRIAL_EVENTS.STEP_STARTED]: [],
  [TRIAL_EVENTS.STEP_PAUSED]: [],
  [TRIAL_EVENTS.STEP_TIMED_OUT]: ["rel"],
  [TRIAL_EVENTS.STEP_SUBMITTED]: ["own"],
  [TRIAL_EVENTS.STEP_APPROVED]: ["own"],
  [TRIAL_EVENTS.REVISION_REQUESTED]: ["coach"],
  [TRIAL_EVENTS.REVISION_SUBMITTED]: ["coach", "own"],
  [TRIAL_EVENTS.STANDUP_CONFIRMED]: ["rel"],
  [TRIAL_EVENTS.STANDUP_RESCHEDULED]: ["rel", "comm"],
  [TRIAL_EVENTS.STANDUP_ATTENDED]: ["rel"],
  [TRIAL_EVENTS.BLOCKER_REPORTED]: ["comm"],
  [TRIAL_EVENTS.HUMAN_ESCALATED]: ["comm"],
  [TRIAL_EVENTS.MESSAGE_SENT]: ["comm"],
  [TRIAL_EVENTS.EVIDENCE_READY]: [],
  [TRIAL_EVENTS.GATE_DECIDED]: [],
  [TRIAL_EVENTS.ACCOMMODATION_TOGGLED]: ["prof"],
};

/** Competencies an event is evidence for. Unknown types map to none. */
export function competenciesForEvent(type: string): CompetencyKey[] {
  return COMPETENCY_MAP[type as TrialEventType] ?? [];
}

// Event type → the rubric dimensions (doc 12 §2) it contributes evidence to.
// 'scout' (SOP writing) and 'spec' (specialization branch) are driven by
// mission kind rather than event type, so they are counted separately from the
// mission list — see the console page.
const RUBRIC_MAP: Record<TrialEventType, RubricKey[]> = {
  [TRIAL_EVENTS.TRIAL_ACKNOWLEDGED]: ["rel"],
  [TRIAL_EVENTS.CHECKIN_REQUESTED]: [],
  [TRIAL_EVENTS.CHECKIN_SUBMITTED]: ["rel", "comm"],
  [TRIAL_EVENTS.CHECKIN_REMINDED]: ["rel"],
  [TRIAL_EVENTS.STEP_STARTED]: ["sys"],
  [TRIAL_EVENTS.STEP_PAUSED]: ["sys"],
  [TRIAL_EVENTS.STEP_TIMED_OUT]: ["rel", "sys"],
  [TRIAL_EVENTS.STEP_SUBMITTED]: ["acc", "own"],
  [TRIAL_EVENTS.STEP_APPROVED]: ["acc"],
  [TRIAL_EVENTS.REVISION_REQUESTED]: ["own"],
  [TRIAL_EVENTS.REVISION_SUBMITTED]: ["own", "acc"],
  [TRIAL_EVENTS.STANDUP_CONFIRMED]: ["rel"],
  [TRIAL_EVENTS.STANDUP_RESCHEDULED]: ["rel", "comm"],
  [TRIAL_EVENTS.STANDUP_ATTENDED]: ["rel"],
  [TRIAL_EVENTS.BLOCKER_REPORTED]: ["comm"],
  [TRIAL_EVENTS.HUMAN_ESCALATED]: ["comm"],
  [TRIAL_EVENTS.MESSAGE_SENT]: ["comm"],
  [TRIAL_EVENTS.EVIDENCE_READY]: [],
  [TRIAL_EVENTS.GATE_DECIDED]: [],
  [TRIAL_EVENTS.ACCOMMODATION_TOGGLED]: [],
};

/** Rubric dimensions an event contributes evidence to. */
export function rubricKeysForEvent(type: string): RubricKey[] {
  return RUBRIC_MAP[type as TrialEventType] ?? [];
}

/** Tally rubric-dimension evidence counts across a set of event types. */
export function rubricEvidenceCounts(
  eventTypes: string[],
): Record<RubricKey, number> {
  const counts = {} as Record<RubricKey, number>;
  for (const d of RUBRIC_DIMENSIONS) counts[d.key] = 0;
  for (const type of eventTypes) {
    for (const key of rubricKeysForEvent(type)) counts[key] += 1;
  }
  return counts;
}
