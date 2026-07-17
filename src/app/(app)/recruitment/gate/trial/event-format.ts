// Presentation helpers for TrialEvents — human titles, glyphs, and actor badge
// variants. Keys track the event taxonomy in src/lib/trial/events.ts.

import { TRIAL_EVENTS } from "@/lib/trial/events";

type BadgeVariant = "default" | "primary" | "sky" | "success" | "warning" | "danger" | "info";

const TITLES: Record<string, string> = {
  [TRIAL_EVENTS.TRIAL_ACKNOWLEDGED]: "Acknowledged the trial",
  [TRIAL_EVENTS.CHECKIN_REQUESTED]: "Check-in window opened",
  [TRIAL_EVENTS.CHECKIN_SUBMITTED]: "Submitted a check-in",
  [TRIAL_EVENTS.CHECKIN_REMINDED]: "Check-in reminder sent",
  [TRIAL_EVENTS.STEP_STARTED]: "Started a step",
  [TRIAL_EVENTS.STEP_PAUSED]: "Paused a step",
  [TRIAL_EVENTS.STEP_TIMED_OUT]: "Step timer auto-paused",
  [TRIAL_EVENTS.STEP_SUBMITTED]: "Submitted a deliverable",
  [TRIAL_EVENTS.STEP_APPROVED]: "Step approved",
  [TRIAL_EVENTS.REVISION_REQUESTED]: "Revision requested",
  [TRIAL_EVENTS.REVISION_SUBMITTED]: "Resubmitted after feedback",
  [TRIAL_EVENTS.STANDUP_CONFIRMED]: "Confirmed the standup",
  [TRIAL_EVENTS.STANDUP_RESCHEDULED]: "Rescheduled the standup",
  [TRIAL_EVENTS.STANDUP_ATTENDED]: "Attended the standup",
  [TRIAL_EVENTS.BLOCKER_REPORTED]: "Reported a blocker",
  [TRIAL_EVENTS.HUMAN_ESCALATED]: "Escalated to a human",
  [TRIAL_EVENTS.MESSAGE_SENT]: "Sent a message",
  [TRIAL_EVENTS.EVIDENCE_READY]: "Evidence package ready",
  [TRIAL_EVENTS.GATE_DECIDED]: "Gate decision recorded",
  [TRIAL_EVENTS.ACCOMMODATION_TOGGLED]: "Accommodations toggled",
};

const GLYPHS: Record<string, string> = {
  [TRIAL_EVENTS.TRIAL_ACKNOWLEDGED]: "🤝",
  [TRIAL_EVENTS.CHECKIN_REQUESTED]: "🕑",
  [TRIAL_EVENTS.CHECKIN_SUBMITTED]: "✅",
  [TRIAL_EVENTS.CHECKIN_REMINDED]: "🔔",
  [TRIAL_EVENTS.STEP_STARTED]: "▶",
  [TRIAL_EVENTS.STEP_PAUSED]: "⏸",
  [TRIAL_EVENTS.STEP_TIMED_OUT]: "⌛",
  [TRIAL_EVENTS.STEP_SUBMITTED]: "📤",
  [TRIAL_EVENTS.STEP_APPROVED]: "✔",
  [TRIAL_EVENTS.REVISION_REQUESTED]: "✏",
  [TRIAL_EVENTS.REVISION_SUBMITTED]: "🔁",
  [TRIAL_EVENTS.STANDUP_CONFIRMED]: "📅",
  [TRIAL_EVENTS.STANDUP_RESCHEDULED]: "↪",
  [TRIAL_EVENTS.STANDUP_ATTENDED]: "🎥",
  [TRIAL_EVENTS.BLOCKER_REPORTED]: "🚧",
  [TRIAL_EVENTS.HUMAN_ESCALATED]: "🆘",
  [TRIAL_EVENTS.MESSAGE_SENT]: "💬",
  [TRIAL_EVENTS.EVIDENCE_READY]: "📦",
  [TRIAL_EVENTS.GATE_DECIDED]: "⚖",
  [TRIAL_EVENTS.ACCOMMODATION_TOGGLED]: "♿",
};

const ACTOR_VARIANT: Record<string, BadgeVariant> = {
  Candidate: "sky",
  AI: "primary",
  System: "default",
  Human: "warning",
};

export function eventTitle(type: string): string {
  return TITLES[type] ?? type;
}
export function eventGlyph(type: string): string {
  return GLYPHS[type] ?? "•";
}
export function actorVariant(actor: string): BadgeVariant {
  return ACTOR_VARIANT[actor] ?? "default";
}
