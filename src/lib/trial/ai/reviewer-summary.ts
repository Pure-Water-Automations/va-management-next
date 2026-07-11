import type { RubricKey, RubricScores } from "@/lib/trial/types";
import { SCORING_PAUSE_EVENTS, TRIAL_EVENTS } from "@/lib/trial/events";
import { chatJson, type TrialAiTransport } from "./client";
import { outputFilter } from "./guardrails";
import { reviewerAssistantPrompt } from "./personas";

export type Competency =
  | "reliability"
  | "communication"
  | "ownership"
  | "coachability"
  | "systems"
  | "professionalism";
export type EvidenceConfidence = "Low" | "Medium" | "High";

interface EventLike {
  id?: string;
  timestamp: Date | string;
  day: number;
  actor?: string;
  type: string;
  label: string;
  dataJson?: unknown;
}

interface MissionLike {
  id?: string;
  templateId?: string;
  status?: string;
  template?: { id?: string; key?: string; kind?: string; title?: string };
  key?: string;
  kind?: string;
  title?: string;
}

interface MessageLike {
  id?: string;
  day: number;
  from: string;
  text: string;
  timestamp?: Date | string;
}

export interface CompetencyEvidence {
  eventId?: string;
  day: number;
  type: string;
  label: string;
  missionKind?: string;
  excludedFromScoring?: boolean;
}

export interface CompetencyGroup {
  competency: Competency;
  confidence: EvidenceConfidence;
  evidence: CompetencyEvidence[];
}

export interface ReviewerSummaryResult {
  competencyGroups: Record<Competency, CompetencyGroup>;
  draftSummary: string | null;
  aiSuggestedScores: RubricScores;
}

interface ReviewerSummaryInput {
  events: EventLike[];
  missions: MissionLike[];
  messages: MessageLike[];
  trial?: { id?: string; accommodationsActive?: boolean };
  transport?: TrialAiTransport;
}

const COMPETENCIES: Competency[] = [
  "reliability",
  "communication",
  "ownership",
  "coachability",
  "systems",
  "professionalism",
];

const EVENT_COMPETENCIES: Partial<Record<string, Competency[]>> = {
  [TRIAL_EVENTS.TRIAL_ACKNOWLEDGED]: ["reliability", "professionalism"],
  [TRIAL_EVENTS.CHECKIN_SUBMITTED]: ["reliability", "communication"],
  [TRIAL_EVENTS.CHECKIN_REMINDED]: ["reliability"],
  [TRIAL_EVENTS.STEP_TIMED_OUT]: ["reliability", "ownership"],
  [TRIAL_EVENTS.STEP_SUBMITTED]: ["reliability", "ownership", "professionalism"],
  [TRIAL_EVENTS.STEP_APPROVED]: ["ownership", "coachability", "professionalism"],
  [TRIAL_EVENTS.REVISION_REQUESTED]: ["coachability", "ownership"],
  [TRIAL_EVENTS.REVISION_SUBMITTED]: ["coachability", "ownership"],
  [TRIAL_EVENTS.STANDUP_CONFIRMED]: ["reliability", "communication"],
  [TRIAL_EVENTS.STANDUP_RESCHEDULED]: ["reliability", "communication"],
  [TRIAL_EVENTS.STANDUP_ATTENDED]: ["reliability", "professionalism"],
  [TRIAL_EVENTS.BLOCKER_REPORTED]: ["communication", "ownership"],
  [TRIAL_EVENTS.MESSAGE_SENT]: ["communication", "professionalism"],
};

const RELIABILITY_TYPES = new Set(
  Object.entries(EVENT_COMPETENCIES)
    .filter(([, groups]) => groups?.includes("reliability"))
    .map(([type]) => type),
);

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function missionKindFor(event: EventLike, missions: MissionLike[]): string | undefined {
  const data = record(event.dataJson);
  const reference = data.missionId ?? data.stepId ?? data.templateId ?? data.stepKey ?? data.key;
  if (typeof data.missionKind === "string") return data.missionKind;
  const mission = missions.find((item) =>
    [item.id, item.templateId, item.key, item.template?.id, item.template?.key].some(
      (candidate) => candidate && candidate === reference,
    ),
  );
  return mission?.template?.kind || mission?.kind;
}

function confidenceFor(evidence: CompetencyEvidence[]): EvidenceConfidence {
  const included = evidence.filter((item) => !item.excludedFromScoring);
  const days = new Set(included.map((item) => item.day));
  const kinds = new Set(included.map((item) => item.missionKind).filter(Boolean));
  if (included.length >= 4 && kinds.has("branch") && [...kinds].some((kind) => kind !== "branch")) {
    return "High";
  }
  if (included.length >= 3 && days.size >= 2) return "Medium";
  return "Low";
}

function clampScore(score: number): number {
  return Math.max(1, Math.min(5, Math.round(score)));
}

function evidenceScore(group: CompetencyGroup): number {
  const included = group.evidence.filter((item) => !item.excludedFromScoring);
  const negative = included.filter((item) =>
    [TRIAL_EVENTS.CHECKIN_REMINDED, TRIAL_EVENTS.STEP_TIMED_OUT, TRIAL_EVENTS.REVISION_REQUESTED].includes(
      item.type as never,
    ),
  ).length;
  const positive = included.length - negative;
  return clampScore(3 + Math.floor(positive / 3) - Math.ceil(negative / 2));
}

function missionEvidenceCount(missions: MissionLike[], kind: string): number {
  return missions.filter(
    (mission) =>
      (mission.template?.kind || mission.kind) === kind &&
      ["SUBMITTED", "NEEDS_REVISION", "APPROVED"].includes(mission.status || ""),
  ).length;
}

function suggestedScores(
  groups: Record<Competency, CompetencyGroup>,
  missions: MissionLike[],
): RubricScores {
  // Documented deterministic proposal heuristic: every dimension starts at the
  // neutral midpoint (3), gains one point per three included positive evidence
  // items, and loses one per two negative items. Mission-only dimensions use
  // submitted/approved evidence counts. Humans remain the final scorers.
  const scores: Record<RubricKey, number> = {
    rel: evidenceScore(groups.reliability),
    comm: evidenceScore(groups.communication),
    acc: evidenceScore(groups.professionalism),
    own: evidenceScore(groups.ownership),
    sys: clampScore(3 + Math.min(2, missionEvidenceCount(missions, "tour"))),
    scout: clampScore(3 + Math.min(2, missionEvidenceCount(missions, "sop"))),
    spec: clampScore(3 + Math.min(2, missionEvidenceCount(missions, "branch"))),
  };
  return scores;
}

function isSummary(value: unknown): value is { draftSummary: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { draftSummary?: unknown }).draftSummary === "string"
  );
}

function removeEvaluativeAdjectives(text: string): string {
  return text.replace(/\b(excellent|impressive|outstanding|amazing|poor|careless|terrible|wonderful)\b\s*/gi, "");
}

export async function buildReviewerSummary({
  events,
  missions,
  messages,
  trial,
  transport,
}: ReviewerSummaryInput): Promise<ReviewerSummaryResult> {
  const groups = Object.fromEntries(
    COMPETENCIES.map((competency) => [
      competency,
      { competency, confidence: "Low" as const, evidence: [] as CompetencyEvidence[] },
    ]),
  ) as Record<Competency, CompetencyGroup>;

  const ordered = [...events].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );
  let humanEscalated = false;
  const hasAccommodationEvents = ordered.some(
    (event) => event.type === TRIAL_EVENTS.ACCOMMODATION_TOGGLED,
  );
  let accommodationActive = hasAccommodationEvents ? false : Boolean(trial?.accommodationsActive);

  for (const event of ordered) {
    if (event.type === TRIAL_EVENTS.HUMAN_ESCALATED) humanEscalated = true;
    if (event.type === TRIAL_EVENTS.ACCOMMODATION_TOGGLED) {
      const data = record(event.dataJson);
      accommodationActive =
        typeof data.active === "boolean" ? data.active : !accommodationActive;
    }
    const explicit = record(event.dataJson).competency;
    const competencies =
      typeof explicit === "string" && COMPETENCIES.includes(explicit as Competency)
        ? [explicit as Competency]
        : EVENT_COMPETENCIES[event.type] || [];
    const paused =
      SCORING_PAUSE_EVENTS.includes(event.type as never) || humanEscalated || accommodationActive;
    for (const competency of competencies) {
      // Fairness pause events remain in the immutable source timeline, but
      // latency/reliability observations in the paused interval do not enter
      // the evidence graph or any score/confidence calculation.
      if (competency === "reliability" && paused && RELIABILITY_TYPES.has(event.type)) continue;
      groups[competency].evidence.push({
        eventId: event.id,
        day: event.day,
        type: event.type,
        label: event.label,
        missionKind: missionKindFor(event, missions),
      });
    }
  }

  for (const competency of COMPETENCIES) {
    groups[competency].confidence = confidenceFor(groups[competency].evidence);
  }
  const aiSuggestedScores = suggestedScores(groups, missions);
  const evidencePayload = {
    competencyGroups: groups,
    recentMessages: messages.slice(-20).map(({ day, from, text }) => ({ day, from, text })),
  };
  const phrased = await chatJson<{ draftSummary: string }>(
    reviewerAssistantPrompt(),
    `Phrase this deterministic evidence summary as concise factual bullets. Preserve Low/Medium/High confidence labels.\n${JSON.stringify(evidencePayload)}`,
    '{ "draftSummary": "string containing neutral bullet points" }',
    { trialId: trial?.id || "reviewer-summary", transport, validate: isSummary },
  );

  return {
    competencyGroups: groups,
    draftSummary: phrased
      ? outputFilter(removeEvaluativeAdjectives(phrased.draftSummary))
      : null,
    aiSuggestedScores,
  };
}
