// PWA Skills Trial — event taxonomy (docs/skills-trial/12-analytics-evidence-and-calibration.md §1).
// Every significant action is logged as an immutable TrialEvent row with one of
// these `type` values. Workers, the engine, and the reviewer timeline all key
// off this list — add here first, never inline string literals.

export const TRIAL_EVENTS = {
  TRIAL_ACKNOWLEDGED: "TRIAL_ACKNOWLEDGED", // Candidate — declared days, timezone, block
  CHECKIN_REQUESTED: "CHECKIN_REQUESTED", // System — check-in window opened
  CHECKIN_SUBMITTED: "CHECKIN_SUBMITTED", // Candidate — answers (Completed/Next/Blocked/ETA)
  CHECKIN_REMINDED: "CHECKIN_REMINDED", // AI — reminder count before response
  STEP_STARTED: "STEP_STARTED", // Candidate — step key, server timestamp
  STEP_PAUSED: "STEP_PAUSED", // Candidate — timer stopped, delta recorded
  STEP_TIMED_OUT: "STEP_TIMED_OUT", // System — auto timer pause after 6 hours
  STEP_SUBMITTED: "STEP_SUBMITTED", // Candidate — step key, links, text values
  STEP_APPROVED: "STEP_APPROVED", // AI/Human — step met criteria
  REVISION_REQUESTED: "REVISION_REQUESTED", // AI — feedback JSON, step key
  REVISION_SUBMITTED: "REVISION_SUBMITTED", // Candidate — revision plan, updated values
  STANDUP_CONFIRMED: "STANDUP_CONFIRMED", // Candidate — day-5 meeting confirmed
  STANDUP_RESCHEDULED: "STANDUP_RESCHEDULED", // Candidate — responsible reschedule
  STANDUP_ATTENDED: "STANDUP_ATTENDED", // Candidate — join time (on time vs late)
  BLOCKER_REPORTED: "BLOCKER_REPORTED", // Candidate — blocker text, step context
  HUMAN_ESCALATED: "HUMAN_ESCALATED", // Candidate — pauses AI scoring indicators
  MESSAGE_SENT: "MESSAGE_SENT", // Candidate/AI — conversational message
  EVIDENCE_READY: "EVIDENCE_READY", // System — all steps approved, gate pending
  GATE_DECIDED: "GATE_DECIDED", // Human — final decision + rationale
  ACCOMMODATION_TOGGLED: "ACCOMMODATION_TOGGLED", // Human — pause/resume fairness scoring
} as const;

export type TrialEventType = (typeof TRIAL_EVENTS)[keyof typeof TRIAL_EVENTS];

// Events excluded from AI reliability/latency scoring suggestions when an
// accommodation is active, or that themselves pause scoring (fairness rule,
// docs/skills-trial/03 §3 + 13 §1.3).
export const SCORING_PAUSE_EVENTS: TrialEventType[] = [
  TRIAL_EVENTS.HUMAN_ESCALATED,
  TRIAL_EVENTS.ACCOMMODATION_TOGGLED,
];
