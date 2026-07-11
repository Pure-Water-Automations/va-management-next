// Mission Control — shared client helpers for the PWA Skills Trial candidate app.
// Everything the views need to talk to the candidate API (bearer = magic-link
// trainingAccessToken) and to translate the frozen contracts in
// src/lib/trial/types.ts into display metadata. No inline string literals for
// statuses / kinds — key off these tables.

import type {
  AcknowledgeRequest,
  EscalateRequest,
  MessageReplyRequest,
  MessageReplyResponse,
  MissionKind,
  StepStartResponse,
  StepPauseResponse,
  StepSubmitRequest,
  StepSubmitResponse,
  TrialMessagesResponse,
  TrialStateResponse,
  TrialStepView,
} from "@/lib/trial/types";
import type { MissionStatus } from "@prisma/client";

// ── API client (Authorization: Bearer <token>) ─────────────────────────────

type ApiResult<T> = (T & { ok: true }) | { ok: false; error: string };

function headers(token: string): HeadersInit {
  return { Authorization: `Bearer ${token}`, "content-type": "application/json" };
}

async function parse<T>(res: Response): Promise<ApiResult<T>> {
  const json = (await res.json().catch(() => null)) as (ApiResult<T> & { error?: string }) | null;
  if (!json) return { ok: false, error: "The server returned an unexpected response." };
  if (!json.ok) return { ok: false, error: json.error || "Something went wrong. Please try again." };
  return json;
}

export async function fetchState(token: string): Promise<ApiResult<TrialStateResponse>> {
  try {
    const res = await fetch("/api/trials/steps", { headers: headers(token), cache: "no-store" });
    return parse<TrialStateResponse>(res);
  } catch {
    return { ok: false, error: "We couldn't reach the workspace. Check your connection and retry." };
  }
}

export async function fetchMessages(token: string): Promise<ApiResult<TrialMessagesResponse>> {
  try {
    const res = await fetch("/api/trials/messages", { headers: headers(token), cache: "no-store" });
    return parse<TrialMessagesResponse>(res);
  } catch {
    return { ok: false, error: "We couldn't load your messages. Please retry." };
  }
}

async function post<T>(token: string, path: string, body: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(path, { method: "POST", headers: headers(token), body: JSON.stringify(body) });
    return parse<T>(res);
  } catch {
    return { ok: false, error: "We couldn't reach the workspace. Please retry." };
  }
}

export const api = {
  acknowledge: (token: string, body: AcknowledgeRequest) =>
    post<{ currentStage: string; nextStepId: string }>(token, "/api/trials/acknowledge", body),
  stepStart: (token: string, stepId: string) =>
    post<StepStartResponse>(token, "/api/trials/step/start", { stepId }),
  stepPause: (token: string, stepId: string) =>
    post<StepPauseResponse>(token, "/api/trials/step/pause", { stepId }),
  stepSubmit: (token: string, body: StepSubmitRequest) =>
    post<StepSubmitResponse>(token, "/api/trials/step/submit", body),
  messageReply: (token: string, body: MessageReplyRequest) =>
    post<MessageReplyResponse>(token, "/api/trials/message/reply", body),
  escalate: (token: string, body: EscalateRequest) =>
    post<{ ok: true }>(token, "/api/trials/escalate", body),
};

// ── Formatting ─────────────────────────────────────────────────────────────

export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function fmtHours(totalSec: number): string {
  return (Math.max(0, totalSec) / 3600).toFixed(1);
}

export function initials(name: string | null | undefined): string {
  if (!name) return "—";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "—";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── Mission kind / status metadata ─────────────────────────────────────────

export const KIND_META: Record<MissionKind, { icon: string; verb: string }> = {
  learn: { icon: "📘", verb: "Read & answer" },
  tour: { icon: "🧭", verb: "Practice in the console" },
  sim: { icon: "💬", verb: "Handle the client request" },
  branch: { icon: "🎯", verb: "Complete your track brief" },
  sop: { icon: "📋", verb: "Document the process" },
  meet: { icon: "📅", verb: "Confirm & attend" },
  reflect: { icon: "🪞", verb: "Reflect on your week" },
};

export type StatusTone = "neutral" | "active" | "review" | "revision" | "done";

export const STATUS_META: Record<MissionStatus, { label: string; tone: StatusTone }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  IN_PROGRESS: { label: "In progress", tone: "active" },
  SUBMITTED: { label: "Submitted", tone: "review" },
  NEEDS_REVISION: { label: "Needs revision", tone: "revision" },
  APPROVED: { label: "Approved", tone: "done" },
};

// A step is "locked" only when it hasn't been started and its due day is still
// ahead — a soft affordance; the engine remains the source of truth on start.
export function isLocked(step: TrialStepView, currentDay: number): boolean {
  return step.status === "NOT_STARTED" && step.dayDue > currentDay;
}

export function isDone(step: TrialStepView): boolean {
  return step.status === "APPROVED";
}

export function isActionable(step: TrialStepView): boolean {
  return step.status === "IN_PROGRESS" || step.status === "NEEDS_REVISION";
}

// The single step the candidate should focus on next.
export function focusStep(steps: TrialStepView[], currentDay: number): TrialStepView | null {
  const ordered = [...steps].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    ordered.find((s) => s.status === "IN_PROGRESS") ??
    ordered.find((s) => s.status === "NEEDS_REVISION") ??
    ordered.find((s) => s.status === "NOT_STARTED" && !isLocked(s, currentDay)) ??
    ordered.find((s) => s.status === "NOT_STARTED") ??
    null
  );
}

// ── Trust ladder (qualitative only — DEC-007, no numeric scores) ────────────

export const TRUST_LADDER = [
  "Getting Started",
  "Onboarding Contributor",
  "Contributor",
  "Trusted Contributor",
  "Trusted Partner",
] as const;

export function trustStanding(approved: number, total: number): string {
  if (total === 0) return TRUST_LADDER[0];
  const ratio = approved / total;
  if (approved === 0) return TRUST_LADDER[0];
  if (ratio < 0.34) return TRUST_LADDER[1];
  if (ratio < 0.67) return TRUST_LADDER[2];
  if (ratio < 1) return TRUST_LADDER[3];
  return TRUST_LADDER[4];
}

// Candidate-facing trust dimensions (qualitative captions, never numbers).
export const TRUST_DIMENSIONS = [
  { key: "reliability", label: "Reliability", blurb: "Meeting commitments and declared windows." },
  { key: "communication", label: "Communication", blurb: "Clear updates, early escalation." },
  { key: "ownership", label: "Ownership", blurb: "Recovering from feedback without defensiveness." },
  { key: "clientTrust", label: "Client Trust", blurb: "Work a client would rely on." },
  { key: "initiative", label: "Initiative", blurb: "Scouting the system, not just executing." },
] as const;

// Qualitative caption for a fill level — deliberately word-based, no digits.
export function qualitativeLevel(ratio: number): string {
  if (ratio <= 0) return "Not yet demonstrated";
  if (ratio < 0.34) return "Emerging";
  if (ratio < 0.67) return "Developing";
  if (ratio < 1) return "Strong";
  return "Consistently strong";
}

// ── Navigation ─────────────────────────────────────────────────────────────

export type NavKey = "home" | "missions" | "messages" | "calendar" | "progress" | "resources";

export const NAV_ITEMS: { key: NavKey; label: string; icon: string }[] = [
  { key: "home", label: "Home", icon: "M3 10.5 12 3l9 7.5M5 9v11h14V9" },
  { key: "missions", label: "Missions", icon: "M4 6h16M4 12h16M4 18h10" },
  { key: "messages", label: "Messages", icon: "M4 5h16v11H9l-5 4z" },
  { key: "calendar", label: "Calendar", icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  { key: "progress", label: "Progress", icon: "M4 20V10M10 20V4M16 20v-7M22 20H2" },
  { key: "resources", label: "Resources", icon: "M5 4h11l3 3v13H5zM9 4v14" },
];

// ── contentJson typed accessors (shapes fixed by the seed pack, appendix E) ──

export interface ScenarioContent {
  question: string;
  options: { id: string; text: string; correct?: boolean }[];
  feedbackCorrect: string;
  feedbackIncorrect: string;
}
export interface TrackBrief {
  label: string;
  brief: string;
}

export function scenarioOf(step: TrialStepView): ScenarioContent | null {
  const c = step.contentJson as { scenario?: ScenarioContent } | null;
  return c?.scenario ?? null;
}
export function checklistOf(step: TrialStepView): string[] {
  const c = step.contentJson as { checklist?: string[] } | null;
  return Array.isArray(c?.checklist) ? c!.checklist : [];
}
export function clientBriefOf(step: TrialStepView): string | null {
  const c = step.contentJson as { clientBrief?: string } | null;
  return c?.clientBrief ?? null;
}
export function tracksOf(step: TrialStepView): Record<string, TrackBrief> | null {
  const c = step.contentJson as { tracks?: Record<string, TrackBrief> } | null;
  return c?.tracks ?? null;
}
export function sopFieldsOf(step: TrialStepView): string[] {
  const c = step.contentJson as { sopFields?: string[] } | null;
  return Array.isArray(c?.sopFields) ? c!.sopFields : [];
}
export function questionsOf(step: TrialStepView): string[] {
  const c = step.contentJson as { questions?: string[] } | null;
  return Array.isArray(c?.questions) ? c!.questions : [];
}
