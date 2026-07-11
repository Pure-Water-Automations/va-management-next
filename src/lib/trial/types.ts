// PWA Skills Trial — shared API contracts (docs/skills-trial/appendices/C-api-and-event-catalog.md).
// This file is the frozen interface between the candidate API, the AI layer,
// the candidate Mission Control UI, the reviewer console, and the workers.
// Extend it in one place; do not fork these shapes elsewhere.

import type { MissionStatus, TrialStatus } from "@prisma/client";

// ── Persona / actor identifiers ────────────────────────────────────────────

export type TrialActorType = "Purii" | "Sarah" | "Emily" | "Michael" | "Human";
export type TrialEventActor = "System" | "Candidate" | "AI" | "Human";
export type SpecializationTrack = "comms" | "coordination" | "research";
export type DeclaredBlock = "Morning" | "Afternoon" | "Evening";
export type MissionKind = "learn" | "tour" | "sim" | "branch" | "sop" | "meet" | "reflect";

// ── AI feedback (Sarah / Purii revision card) ──────────────────────────────

export interface TrialFeedback {
  obs: string; // what was observed in the artifact
  impact: string; // operational impact on clients
  sugg: string; // actionable revision step
  enc: string; // supportive closing remark
}

export interface AiEvaluationProposal {
  approved: boolean;
  feedback: TrialFeedback;
}

// ── Candidate API payloads (bearer = magic-link trainingAccessToken) ───────

// POST /api/trials/acknowledge
export interface AcknowledgeRequest {
  name: string;
  timezone: string; // e.g. "GMT+8 — Manila"
  declaredDays: string[]; // ["Mon","Tue",...]
  declaredBlock: DeclaredBlock;
}
export interface AcknowledgeResponse {
  ok: true;
  currentStage: string; // "tenhr_in_progress"
  nextStepId: string; // MissionTemplate.key of the first step
}

// GET /api/trials/steps
export interface TrialStepView {
  missionId: string; // CandidateMission.id
  key: string; // MissionTemplate.key
  sortOrder: number;
  title: string;
  kind: MissionKind;
  kindLabel: string;
  estMinutes: number;
  dayDue: number;
  clientName: string;
  story: string;
  deliverableText: string;
  instructionsText: string;
  contentJson: unknown; // scenario checks / branch briefs / reflection questions
  status: MissionStatus;
  secondsSpent: number;
  startedAt: string | null;
  completedAt: string | null;
  timerRunning: boolean;
  submittedText1: string | null;
  submittedText2: string | null;
  submittedLink: string | null;
  revisionPlan: string | null;
  feedback: TrialFeedback | null;
}
export interface TrialStateResponse {
  ok: true;
  trial: {
    id: string;
    status: TrialStatus;
    startDate: string;
    deadlineDate: string;
    currentDay: number; // 1-based trial day derived from startDate + timezone
    activeSeconds: number;
    timezone: string;
    declaredDays: string[];
    declaredBlock: DeclaredBlock;
    specializationTrack: SpecializationTrack | null;
    acknowledgedAt: string | null;
    candidateName: string | null;
  };
  steps: TrialStepView[];
}

// POST /api/trials/step/start  (also used to resume after NEEDS_REVISION)
export interface StepStartRequest {
  stepId: string; // MissionTemplate.key
}
export interface StepStartResponse {
  ok: true;
  status: MissionStatus; // IN_PROGRESS
  startedAt: string;
}

// POST /api/trials/step/pause  (stateless server delta; no payload beyond key)
export interface StepPauseRequest {
  stepId: string;
}
export interface StepPauseResponse {
  ok: true;
  secondsSpent: number;
  activeSeconds: number; // trial rollup
}

// POST /api/trials/step/submit
export interface StepSubmitRequest {
  stepId: string;
  submittedText1?: string; // client message / comment
  submittedText2?: string; // draft / SOP fields JSON string
  submittedLink?: string;
  revisionPlan?: string; // required when resubmitting from NEEDS_REVISION
  checklistChecks?: boolean[];
}
export interface StepSubmitResponse {
  ok: true;
  status: MissionStatus; // SUBMITTED | APPROVED | NEEDS_REVISION
  evaluationProposed?: {
    needsRevision: boolean;
    feedback: TrialFeedback;
  };
}

// POST /api/trials/message/reply
export interface CheckinAnswers {
  a: string; // Completed
  b: string; // Next steps
  c: string; // Blockers
  d: string; // ETA changes
}
export interface MessageReplyRequest {
  type: "checkin" | "chat";
  actorType?: TrialActorType; // which thread a chat message goes to (default Purii)
  answers?: CheckinAnswers; // when type = "checkin"
  text?: string; // when type = "chat"
}
export interface MessageReplyResponse {
  ok: true;
  reply?: TrialMessageView; // AI response, when one is generated
}

// GET /api/trials/messages
export interface TrialMessageView {
  id: string;
  conversationId: string;
  actorType: TrialActorType;
  timestamp: string;
  day: number;
  from: string; // purii | me | human | sarah | emily | michael
  text: string;
  tag: string | null;
}
export interface TrialMessagesResponse {
  ok: true;
  conversations: { id: string; actorType: TrialActorType; messages: TrialMessageView[] }[];
}

// POST /api/trials/escalate
export interface EscalateRequest {
  type: "blocker" | "human_help";
  messageText: string;
  stepId?: string; // blocker context
}
export interface EscalateResponse {
  ok: true;
}

// ── Reviewer API payloads (NextAuth session; recruiter/admin) ──────────────

export type GateDecision = "pass" | "revision" | "waitlist" | "close";

// Rubric dimension keys + weights (docs/skills-trial/12 §2)
export const RUBRIC_DIMENSIONS = [
  { key: "rel", label: "Reliability & Commitments", weight: 20, core: true },
  { key: "comm", label: "Communication & Escalation", weight: 20, core: true },
  { key: "acc", label: "Instructions & Accuracy", weight: 20, core: true },
  { key: "own", label: "Ownership & Recovery", weight: 15, core: true },
  { key: "sys", label: "VA Manager Console Discipline", weight: 10, core: false },
  { key: "scout", label: "Systems Scout / SOP Writing", weight: 10, core: false },
  { key: "spec", label: "Specialization Branch Signal", weight: 5, core: false },
] as const;
export type RubricKey = (typeof RUBRIC_DIMENSIONS)[number]["key"];
export type RubricScores = Record<RubricKey, number>; // 1-5 each

// Pass rule: weighted total >= 75/100 AND >= 3 on every core dimension.
export const PASS_MIN_TOTAL = 75;
export const PASS_MIN_CORE_SCORE = 3;

export function rubricTotal(scores: RubricScores): number {
  // weighted: score(1-5) -> pct of dimension weight
  return RUBRIC_DIMENSIONS.reduce(
    (sum, d) => sum + (scores[d.key] / 5) * d.weight,
    0,
  );
}

// POST /api/trials/review
export interface GateReviewRequest {
  candidateId: string;
  decision: GateDecision;
  rationale: string; // required, evidence-based
  rubricScores: RubricScores;
}
export interface GateReviewResponse {
  ok: true;
  newStage: string;
}
