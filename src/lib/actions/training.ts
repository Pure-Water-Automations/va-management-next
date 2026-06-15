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

  // Readiness is now driven by the task checklist (all tasks done), not raw
  // minutes — see recomputeChecklistReadiness. We only refresh the time rollups.
  return db.candidate.update({
    where: { candidateId },
    data: {
      trainingTotalMinutes,
      trainingSessionCount: counted.length,
      trainingLastSessionAt,
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

// ── Skills-trial checklist (short tasks worked through the timer) ───────────

export type ChecklistTaskView = {
  assignmentId: string;
  kind: string;
  task: string;
  instructions: string | null;
  instructionsLink: string | null;
  skill: string | null;
  estMinutes: number | null;
  status: string; // not_started | in_progress | done
  minutesSpent: number;
  outputLink: string | null;
  note: string | null;
  running: boolean;
};

export type ChecklistState = {
  name: string | null;
  deadline: Date | null;
  tasks: ChecklistTaskView[];
  openTaskId: string | null;
  openSince: Date | null;
  doneCount: number;
  totalCount: number;
  readyForReview: boolean;
};

function cleanField(value?: string): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed ? trimmed : null;
}

async function buildChecklistState(candidateId: string): Promise<ChecklistState> {
  const [candidate, tasks, progress, openSession] = await Promise.all([
    db.candidate.findUnique({ where: { candidateId }, select: { name: true, tenhrDeadline: true, trainingReadyForReview: true } }),
    db.trainingAssignment.findMany({ where: { active: true }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] }),
    db.trainingTaskProgress.findMany({ where: { candidateId } }),
    db.trainingSession.findFirst({ where: { candidateId, status: "active" }, orderBy: { startTime: "desc" } }),
  ]);
  if (!candidate) throw new Error(INVALID_TOKEN_MESSAGE);

  const byTask = new Map(progress.map((p) => [p.assignmentId, p]));
  const openTaskId = openSession?.assignmentId ?? null;
  const views: ChecklistTaskView[] = tasks.map((t) => {
    const p = byTask.get(t.id);
    return {
      assignmentId: t.id,
      kind: t.kind,
      task: t.task,
      instructions: t.instructions,
      instructionsLink: t.instructionsLink,
      skill: t.skill,
      estMinutes: t.estMinutes,
      status: p?.status ?? "not_started",
      minutesSpent: p?.minutesSpent ?? 0,
      outputLink: p?.outputLink ?? null,
      note: p?.note ?? null,
      running: openTaskId === t.id,
    };
  });

  return {
    name: candidate.name,
    deadline: candidate.tenhrDeadline,
    tasks: views,
    openTaskId,
    openSince: openSession?.startTime ?? null,
    doneCount: views.filter((v) => v.status === "done").length,
    totalCount: views.length,
    readyForReview: candidate.trainingReadyForReview,
  };
}

/** Ready for review once every active task has a `done` progress row. */
async function recomputeChecklistReadiness(candidateId: string): Promise<boolean> {
  const tasks = await db.trainingAssignment.findMany({ where: { active: true }, select: { id: true } });
  if (tasks.length === 0) return false;
  const done = await db.trainingTaskProgress.count({
    where: { candidateId, status: "done", assignmentId: { in: tasks.map((t) => t.id) } },
  });
  const ready = done >= tasks.length;
  await db.candidate.update({ where: { candidateId }, data: { trainingReadyForReview: ready } });
  return ready;
}

export async function getChecklistState(token: string): Promise<ChecklistState> {
  const candidate = await candidateForToken(token);
  return buildChecklistState(candidate.candidateId);
}

export async function startTask(token: string, assignmentId: string): Promise<ChecklistState> {
  const candidate = await candidateForToken(token);
  if (!START_ALLOWED_STAGES.has(candidate.currentStage)) {
    throw new Error("Your skills trial isn't open right now. Please contact your recruiter.");
  }
  const task = await db.trainingAssignment.findFirst({ where: { id: assignmentId, active: true }, select: { id: true, task: true, instructionsLink: true } });
  if (!task) throw new Error("That task isn't available.");

  const open = await db.trainingSession.findFirst({ where: { candidateId: candidate.candidateId, status: "active" }, select: { sessionId: true } });
  if (open) throw new Error("You have a timer running. Finish or stop it before starting another task.");

  const now = new Date();
  await db.trainingSession.create({
    data: {
      candidateId: candidate.candidateId,
      candidateEmail: candidate.email,
      candidateName: candidate.name,
      assignmentId: task.id,
      assignmentTitle: task.task,
      assignmentLink: task.instructionsLink,
      startTime: now,
      status: "active",
      reviewStatus: "needs_review",
    },
  });
  await db.trainingTaskProgress.upsert({
    where: { candidateId_assignmentId: { candidateId: candidate.candidateId, assignmentId: task.id } },
    update: { status: "in_progress", startedAt: now },
    create: { candidateId: candidate.candidateId, assignmentId: task.id, status: "in_progress", startedAt: now },
  });

  await logActivity({ source: "training_tracker", eventType: "task_started", summary: `${activityName({ candidateName: candidate.name, candidateEmail: candidate.email })} started "${task.task}"` });
  return buildChecklistState(candidate.candidateId);
}

/** End the open session (if any), banking its minutes onto the task. */
async function endOpenSession(candidateId: string): Promise<{ assignmentId: string | null; minutes: number } | null> {
  const open = await db.trainingSession.findFirst({ where: { candidateId, status: "active" }, orderBy: { startTime: "desc" } });
  if (!open || !open.startTime) return null;
  const endTime = new Date();
  const minutes = durationMinutes(open.startTime, endTime);
  const maxMinutes = await maxSingleSessionMinutes();
  const reviewStatus: ReviewStatus = minutes > maxMinutes ? "question" : "needs_review";

  await db.trainingSession.update({
    where: { sessionId: open.sessionId },
    data: { endTime, durationMinutes: minutes, status: "completed", reviewStatus },
  });
  if (open.assignmentId) {
    await db.trainingTaskProgress.upsert({
      where: { candidateId_assignmentId: { candidateId, assignmentId: open.assignmentId } },
      update: { minutesSpent: { increment: minutes } },
      create: { candidateId, assignmentId: open.assignmentId, status: "in_progress", minutesSpent: minutes, startedAt: open.startTime },
    });
  }
  await refreshCandidateRollups(candidateId, "logged");
  return { assignmentId: open.assignmentId, minutes };
}

export async function stopTask(token: string): Promise<ChecklistState> {
  const candidate = await candidateForToken(token);
  const ended = await endOpenSession(candidate.candidateId);
  if (!ended) throw new Error("You don't have a timer running.");
  await logActivity({ source: "training_tracker", eventType: "task_paused", summary: `${activityName({ candidateName: candidate.name, candidateEmail: candidate.email })} paused a task (${ended.minutes}m)` });
  return buildChecklistState(candidate.candidateId);
}

export async function completeTask(token: string, assignmentId: string, outputLink?: string, note?: string): Promise<ChecklistState> {
  const candidate = await candidateForToken(token);
  const task = await db.trainingAssignment.findFirst({ where: { id: assignmentId }, select: { id: true, task: true } });
  if (!task) throw new Error("That task isn't available.");

  const open = await db.trainingSession.findFirst({ where: { candidateId: candidate.candidateId, status: "active" }, select: { assignmentId: true } });
  if (open && open.assignmentId && open.assignmentId !== assignmentId) {
    throw new Error("Finish or stop your running timer first.");
  }
  if (open) await endOpenSession(candidate.candidateId);

  await db.trainingTaskProgress.upsert({
    where: { candidateId_assignmentId: { candidateId: candidate.candidateId, assignmentId } },
    update: { status: "done", completedAt: new Date(), outputLink: cleanField(outputLink), note: cleanField(note) },
    create: { candidateId: candidate.candidateId, assignmentId, status: "done", completedAt: new Date(), outputLink: cleanField(outputLink), note: cleanField(note) },
  });
  const ready = await recomputeChecklistReadiness(candidate.candidateId);

  await logActivity({ source: "training_tracker", eventType: "task_completed", summary: `${activityName({ candidateName: candidate.name, candidateEmail: candidate.email })} completed "${task.task}"${ready ? " — all tasks done, ready for review" : ""}` });
  return buildChecklistState(candidate.candidateId);
}
