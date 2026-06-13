import { randomUUID } from "crypto";
import type { ReviewStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { loadSettings, num } from "@/lib/settings";

const INVALID_TOKEN_MESSAGE = "This training link is invalid or has expired.";
const START_ALLOWED_STAGES = new Set(["tenhr_invited", "tenhr_in_progress"]);
const DEFAULT_REQUIRED_MINUTES = 10 * 60;
const DEFAULT_MAX_SINGLE_SESSION_MINUTES = 360;

type RollupMode = "logged" | "approved";

type PublicSession = {
  sessionId: string;
  startTime: Date | null;
  endTime: Date | null;
  durationMinutes: number | null;
  status: string;
  reviewStatus: string;
  workNotes: string | null;
};

type CandidateState = {
  name: string | null;
  assignment: {
    title: string | null;
    link: string | null;
  };
  deadline: Date | null;
  sessions: PublicSession[];
  openSession: PublicSession | null;
  totalMinutes: number;
  sessionCount: number;
  lastSessionAt: Date | null;
  readiness: {
    readyForReview: boolean;
    requiredMinutes: number;
    remainingMinutes: number;
    progressPct: number;
  };
};

function assertToken(token: string): string {
  const trimmed = token.trim();
  if (!trimmed) throw new Error(INVALID_TOKEN_MESSAGE);
  return trimmed;
}

async function requiredTrainingMinutes(): Promise<number> {
  const settings = await loadSettings();
  const hours = num(settings, "training_min_hours_required", DEFAULT_REQUIRED_MINUTES / 60);
  return Math.round((hours > 0 ? hours : DEFAULT_REQUIRED_MINUTES / 60) * 60);
}

async function maxSingleSessionMinutes(): Promise<number> {
  const settings = await loadSettings();
  const minutes = num(
    settings,
    "training_max_single_session_minutes",
    DEFAULT_MAX_SINGLE_SESSION_MINUTES,
  );
  return minutes > 0 ? minutes : DEFAULT_MAX_SINGLE_SESSION_MINUTES;
}

async function candidateForToken(token: string) {
  const trainingAccessToken = assertToken(token);
  const candidate = await db.candidate.findUnique({
    where: { trainingAccessToken },
  });
  if (!candidate) throw new Error(INVALID_TOKEN_MESSAGE);
  return candidate;
}

function publicSession(session: {
  sessionId: string;
  startTime: Date | null;
  endTime: Date | null;
  durationMinutes: number | null;
  status: string;
  reviewStatus: string;
  workNotes: string | null;
}): PublicSession {
  return {
    sessionId: session.sessionId,
    startTime: session.startTime,
    endTime: session.endTime,
    durationMinutes: session.durationMinutes,
    status: session.status,
    reviewStatus: session.reviewStatus,
    workNotes: session.workNotes,
  };
}

async function buildCandidateState(candidateId: string): Promise<CandidateState> {
  const candidate = await db.candidate.findUnique({
    where: { candidateId },
    include: {
      sessions: {
        where: { status: { not: "void" } },
        orderBy: [{ startTime: "desc" }, { createdAt: "desc" }],
      },
    },
  });
  if (!candidate) throw new Error(INVALID_TOKEN_MESSAGE);

  const requiredMinutes = await requiredTrainingMinutes();
  const totalMinutes = candidate.trainingTotalMinutes;
  const progressPct =
    requiredMinutes > 0 ? Math.min(100, Math.round((totalMinutes / requiredMinutes) * 100)) : 0;

  const openSession = candidate.sessions.find((session) => session.status === "active") ?? null;

  return {
    name: candidate.name,
    assignment: {
      title: candidate.tenhrAssignmentTitle,
      link: candidate.tenhrAssignmentLink,
    },
    deadline: candidate.tenhrDeadline,
    sessions: candidate.sessions.map(publicSession),
    openSession: openSession ? publicSession(openSession) : null,
    totalMinutes,
    sessionCount: candidate.trainingSessionCount,
    lastSessionAt: candidate.trainingLastSessionAt,
    readiness: {
      readyForReview: candidate.trainingReadyForReview,
      requiredMinutes,
      remainingMinutes: Math.max(0, requiredMinutes - totalMinutes),
      progressPct,
    },
  };
}

function shouldCountSession(
  session: { status: string; reviewStatus: string; durationMinutes: number | null },
  mode: RollupMode,
): boolean {
  if (session.durationMinutes == null || session.durationMinutes <= 0) return false;
  if (session.status === "void" || session.reviewStatus === "void") return false;
  if (mode === "approved") return session.status === "completed" && session.reviewStatus === "approved";
  return session.status === "completed" && session.reviewStatus !== "rejected";
}

async function refreshCandidateRollups(candidateId: string, mode: RollupMode) {
  const sessions = await db.trainingSession.findMany({
    where: { candidateId },
    select: {
      durationMinutes: true,
      endTime: true,
      startTime: true,
      status: true,
      reviewStatus: true,
    },
  });

  const counted = sessions.filter((session) => shouldCountSession(session, mode));
  const trainingTotalMinutes = counted.reduce(
    (sum, session) => sum + (session.durationMinutes ?? 0),
    0,
  );
  const trainingLastSessionAt =
    counted
      .map((session) => session.endTime ?? session.startTime)
      .filter((value): value is Date => value instanceof Date)
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
  const requiredMinutes = await requiredTrainingMinutes();

  return db.candidate.update({
    where: { candidateId },
    data: {
      trainingTotalMinutes,
      trainingSessionCount: counted.length,
      trainingLastSessionAt,
      trainingReadyForReview: trainingTotalMinutes >= requiredMinutes,
    },
    select: {
      trainingTotalMinutes: true,
      trainingSessionCount: true,
      trainingLastSessionAt: true,
      trainingReadyForReview: true,
    },
  });
}

function durationMinutes(start: Date, end: Date): number {
  const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
  return Number.isFinite(minutes) && minutes > 0 ? minutes : 1;
}

function activityName(input: { candidateName: string | null; candidateEmail: string | null }): string {
  return input.candidateName ?? input.candidateEmail ?? "Candidate";
}

export async function getCandidateState(token: string): Promise<CandidateState> {
  const candidate = await candidateForToken(token);
  return buildCandidateState(candidate.candidateId);
}

export async function startSession(token: string): Promise<CandidateState> {
  const candidate = await candidateForToken(token);
  if (!START_ALLOWED_STAGES.has(candidate.currentStage)) {
    throw new Error("Your training is not open right now. Please contact your recruiter.");
  }

  const existingOpen = await db.trainingSession.findFirst({
    where: { candidateId: candidate.candidateId, status: "active" },
    select: { sessionId: true },
  });
  if (existingOpen) {
    throw new Error("You already have a session in progress. End it before starting a new one.");
  }

  await db.trainingSession.create({
    data: {
      candidateId: candidate.candidateId,
      candidateEmail: candidate.email,
      candidateName: candidate.name,
      assignmentTitle: candidate.tenhrAssignmentTitle,
      assignmentLink: candidate.tenhrAssignmentLink,
      startTime: new Date(),
      status: "active",
      reviewStatus: "needs_review",
    },
  });

  await logActivity({
    source: "training_tracker",
    eventType: "training_session_started",
    summary: `${activityName({
      candidateName: candidate.name,
      candidateEmail: candidate.email,
    })} started a training session`,
  });

  return buildCandidateState(candidate.candidateId);
}

export async function endSession(token: string, workNotes?: string): Promise<CandidateState> {
  const candidate = await candidateForToken(token);
  const openSession = await db.trainingSession.findFirst({
    where: { candidateId: candidate.candidateId, status: "active" },
    orderBy: [{ startTime: "desc" }, { createdAt: "desc" }],
  });
  if (!openSession) throw new Error("You do not have a session in progress.");
  if (!openSession.startTime) throw new Error("The open session is missing a start time.");

  const endTime = new Date();
  const minutes = durationMinutes(openSession.startTime, endTime);
  const maxMinutes = await maxSingleSessionMinutes();
  const reviewStatus: ReviewStatus = minutes > maxMinutes ? "question" : "needs_review";
  const reviewNotes =
    reviewStatus === "question"
      ? `Session exceeded ${maxMinutes} minutes; please confirm with the candidate.`
      : openSession.reviewNotes;

  await db.trainingSession.update({
    where: { sessionId: openSession.sessionId },
    data: {
      endTime,
      durationMinutes: minutes,
      status: "completed",
      workNotes: workNotes?.trim() || null,
      reviewStatus,
      reviewNotes,
    },
  });
  await refreshCandidateRollups(candidate.candidateId, "logged");

  await logActivity({
    source: "training_tracker",
    eventType: "training_session_ended",
    summary: `${activityName({
      candidateName: candidate.name,
      candidateEmail: candidate.email,
    })} logged ${minutes} minutes of training`,
  });

  return buildCandidateState(candidate.candidateId);
}

export async function markSessionReviewed(
  sessionId: string,
  reviewStatus: string,
  reviewNotes: string | undefined,
  reviewerEmail: string,
) {
  const normalizedStatus = reviewStatus.trim().toLowerCase();
  if (!["approved", "question", "rejected"].includes(normalizedStatus)) {
    throw new Error("reviewStatus must be approved, question, or rejected");
  }

  const session = await db.trainingSession.findUnique({ where: { sessionId } });
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  if (session.status === "active") throw new Error("Active sessions cannot be reviewed.");
  if (session.status === "void") throw new Error("Voided sessions cannot be reviewed.");

  await db.trainingSession.update({
    where: { sessionId },
    data: {
      status: normalizedStatus === "rejected" ? "rejected" : "completed",
      reviewStatus: normalizedStatus as ReviewStatus,
      reviewNotes: reviewNotes?.trim() || session.reviewNotes,
      reviewedBy: reviewerEmail,
      reviewedAt: new Date(),
    },
  });
  const rollups = await refreshCandidateRollups(session.candidateId, "approved");

  await logActivity({
    source: "training_tracker",
    eventType: "training_session_reviewed",
    severity: normalizedStatus === "rejected" ? "warning" : "info",
    summary: `Training session ${sessionId} marked ${normalizedStatus} by ${reviewerEmail}`,
  });

  return rollups;
}

export async function voidSession(sessionId: string, reason: string | undefined, reviewerEmail: string) {
  const session = await db.trainingSession.findUnique({ where: { sessionId } });
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  await db.trainingSession.update({
    where: { sessionId },
    data: {
      status: "void",
      reviewStatus: "void",
      reviewNotes: reason?.trim() || session.reviewNotes,
      reviewedBy: reviewerEmail,
      reviewedAt: new Date(),
    },
  });
  const rollups = await refreshCandidateRollups(session.candidateId, "approved");

  await logActivity({
    source: "training_tracker",
    eventType: "training_session_voided",
    severity: "warning",
    summary: `Training session ${sessionId} voided by ${reviewerEmail}`,
  });

  return rollups;
}

export async function generateLink(candidateId: string, rotate = false): Promise<string> {
  const candidate = await db.candidate.findUnique({
    where: { candidateId },
    select: { candidateId: true, trainingAccessToken: true, name: true, email: true },
  });
  if (!candidate) throw new Error(`Candidate not found: ${candidateId}`);

  const token = !rotate && candidate.trainingAccessToken ? candidate.trainingAccessToken : randomUUID();
  if (token !== candidate.trainingAccessToken) {
    await db.candidate.update({
      where: { candidateId },
      data: { trainingAccessToken: token },
    });
  }

  const baseUrl = process.env.APP_BASE_URL?.trim().replace(/\/+$/, "");
  if (!baseUrl) throw new Error("APP_BASE_URL is not configured.");
  const url = `${baseUrl}/track/${token}`;

  await logActivity({
    source: "training_tracker",
    eventType: "training_link_generated",
    summary: `${activityName({
      candidateName: candidate.name,
      candidateEmail: candidate.email,
    })} training link ${rotate ? "rotated" : "generated"}`,
  });

  return url;
}
