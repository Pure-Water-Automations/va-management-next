import type {
  Candidate,
  CandidateMission,
  MissionStatus,
  MissionTemplate,
  Prisma,
  TrialEvent,
  TrialMessage,
} from "@prisma/client";
import { db } from "@/lib/db";
import { evaluateSimSubmission, generateActorReply } from "@/lib/trial/ai-hooks";
import { TRIAL_EVENTS, type TrialEventType } from "@/lib/trial/events";
import type {
  AcknowledgeRequest,
  AcknowledgeResponse,
  AiEvaluationProposal,
  DeclaredBlock,
  EscalateRequest,
  MessageReplyRequest,
  MessageReplyResponse,
  MissionKind,
  StepPauseResponse,
  StepStartResponse,
  StepSubmitRequest,
  StepSubmitResponse,
  TrialActorType,
  TrialEventActor,
  TrialFeedback,
  TrialMessagesResponse,
  TrialMessageView,
  TrialStateResponse,
} from "@/lib/trial/types";

const MAX_TIMER_SECONDS = 6 * 60 * 60;
const VALID_DAYS = new Set(["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]);
const VALID_BLOCKS = new Set<DeclaredBlock>(["Morning", "Afternoon", "Evening"]);
const VALID_ACTORS = new Set<TrialActorType>(["Purii", "Sarah", "Emily", "Michael", "Human"]);

export type TrialErrorCode =
  | "INVALID_TOKEN"
  | "TRIAL_NOT_OPEN"
  | "TRIAL_NOT_FOUND"
  | "MISSION_NOT_FOUND"
  | "ILLEGAL_TRANSITION"
  | "VALIDATION"
  | "NO_ACTIVE_PROGRAM";

export class TrialEngineError extends Error {
  constructor(
    public readonly code: TrialErrorCode,
    message: string,
    public readonly completionStatus?: string,
  ) {
    super(message);
    this.name = "TrialEngineError";
  }
}

export type ResolvedTrialCandidate = Pick<
  Candidate,
  "candidateId" | "name" | "email" | "currentStage" | "trainingReadyForReview"
>;

export function skillsTrialV2Enabled(value = process.env.SKILLS_TRIAL_V2): boolean {
  return typeof value === "string" && ["true", "1", "on", "yes"].includes(value.trim().toLowerCase());
}

export async function resolveTrialCandidate(token: string): Promise<ResolvedTrialCandidate> {
  const trainingAccessToken = token.trim();
  if (!trainingAccessToken) {
    throw new TrialEngineError("INVALID_TOKEN", "This trial link is invalid or has expired.");
  }
  const candidate = await db.candidate.findUnique({
    where: { trainingAccessToken },
    select: {
      candidateId: true,
      name: true,
      email: true,
      currentStage: true,
      trainingReadyForReview: true,
    },
  });
  if (!candidate) {
    throw new TrialEngineError("INVALID_TOKEN", "This trial link is invalid or has expired.");
  }
  if (candidate.currentStage !== "tenhr_in_progress") {
    throw new TrialEngineError(
      "TRIAL_NOT_OPEN",
      "This skills trial is no longer open.",
      candidate.currentStage,
    );
  }
  return candidate;
}

export function canTransitionMission(from: MissionStatus, to: MissionStatus): boolean {
  const legal: Record<MissionStatus, MissionStatus[]> = {
    NOT_STARTED: ["IN_PROGRESS"],
    IN_PROGRESS: ["SUBMITTED"],
    SUBMITTED: ["APPROVED", "NEEDS_REVISION"],
    NEEDS_REVISION: ["IN_PROGRESS"],
    APPROVED: [],
  };
  return legal[from].includes(to);
}

export function assertMissionTransition(from: MissionStatus, to: MissionStatus): void {
  if (!canTransitionMission(from, to)) {
    throw new TrialEngineError(
      "ILLEGAL_TRANSITION",
      `Mission cannot move from ${from} to ${to}.`,
    );
  }
}

export function calculateTimerDelta(startedAt: Date, now: Date): number {
  const seconds = Math.floor((now.getTime() - startedAt.getTime()) / 1000);
  return Math.min(MAX_TIMER_SECONDS, Math.max(0, Number.isFinite(seconds) ? seconds : 0));
}

export function timezoneOffsetMinutes(timezone: string): number {
  const match = /^\s*GMT\s*([+-])\s*(\d{1,2})(?::?(\d{2}))?/i.exec(timezone);
  if (!match) return 0;
  const hours = Number(match[2]);
  const minutes = Number(match[3] ?? 0);
  if (hours > 14 || minutes > 59) return 0;
  const value = hours * 60 + minutes;
  return match[1] === "-" ? -value : value;
}

function localDateParts(date: Date, timezone: string): { year: number; month: number; day: number; hour: number; weekDay: string } {
  const shifted = new Date(date.getTime() + timezoneOffsetMinutes(timezone) * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    weekDay: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][shifted.getUTCDay()],
  };
}

export function currentTrialDay(startDate: Date, timezone: string, now = new Date()): number {
  const start = localDateParts(startDate, timezone);
  const current = localDateParts(now, timezone);
  const startDay = Date.UTC(start.year, start.month, start.day);
  const currentDay = Date.UTC(current.year, current.month, current.day);
  return Math.max(1, Math.floor((currentDay - startDay) / 86_400_000) + 1);
}

export function isWithinDeclaredWindow(
  date: Date,
  timezone: string,
  declaredDays: string[],
  declaredBlock: DeclaredBlock,
): boolean {
  const local = localDateParts(date, timezone);
  if (!declaredDays.includes(local.weekDay)) return false;
  const ranges: Record<DeclaredBlock, [number, number]> = {
    Morning: [6, 12],
    Afternoon: [12, 18],
    Evening: [18, 24],
  };
  const [start, end] = ranges[declaredBlock];
  return local.hour >= start && local.hour < end;
}

export function stripHiddenTargets(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stripHiddenTargets);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => key !== "hiddenTargets")
      .map(([key, child]) => [key, stripHiddenTargets(child)]),
  );
}

export async function logTrialEvent(
  trialId: string,
  day: number,
  actor: TrialEventActor,
  type: TrialEventType,
  label: string,
  dataJson?: Prisma.InputJsonValue,
): Promise<TrialEvent> {
  return db.trialEvent.create({
    data: { trialId, day, actor, type, label, ...(dataJson === undefined ? {} : { dataJson }) },
  });
}

export async function initializeCandidateTrial(candidateId: string, now = new Date()) {
  if (!skillsTrialV2Enabled()) {
    throw new TrialEngineError("TRIAL_NOT_FOUND", "Skills Trial V2 is disabled.");
  }
  const existing = await db.candidateTrial.findUnique({ where: { candidateId } });
  if (existing) return existing;

  return db.$transaction(async (tx) => {
    const raced = await tx.candidateTrial.findUnique({ where: { candidateId } });
    if (raced) return raced;
    const program = await tx.trialProgramVersion.findFirst({
      where: { active: true },
      orderBy: [{ versionNumber: "desc" }],
      include: { templates: { orderBy: { sortOrder: "asc" } } },
    });
    if (!program) {
      throw new TrialEngineError("NO_ACTIVE_PROGRAM", "No active skills-trial program is configured.");
    }
    const deadlineDate = new Date(now.getTime() + 7 * 86_400_000);
    return tx.candidateTrial.create({
      data: {
        candidateId,
        programVersionId: program.id,
        startDate: now,
        deadlineDate,
        missions: {
          create: program.templates.map((template) => ({ templateId: template.id })),
        },
      },
    });
  });
}

async function trialWithMissions(candidateId: string) {
  return db.candidateTrial.findUnique({
    where: { candidateId },
    include: {
      candidate: { select: { name: true } },
      missions: { include: { template: true }, orderBy: { template: { sortOrder: "asc" } } },
    },
  });
}

function requireTrial<T>(trial: T | null): T {
  if (!trial) throw new TrialEngineError("TRIAL_NOT_FOUND", "Trial has not been initialized.");
  return trial;
}

export async function getTrialState(candidateId: string, initialize = false, now = new Date()): Promise<TrialStateResponse> {
  if (initialize) await initializeCandidateTrial(candidateId, now);
  const trial = requireTrial(await trialWithMissions(candidateId));
  return {
    ok: true,
    trial: {
      id: trial.id,
      status: trial.status,
      startDate: trial.startDate.toISOString(),
      deadlineDate: trial.deadlineDate.toISOString(),
      currentDay: currentTrialDay(trial.startDate, trial.timezone, now),
      activeSeconds: trial.activeSeconds,
      timezone: trial.timezone,
      declaredDays: trial.declaredDays.split(",").filter(Boolean),
      declaredBlock: trial.declaredBlock as DeclaredBlock,
      specializationTrack: trial.specializationTrack as TrialStateResponse["trial"]["specializationTrack"],
      acknowledgedAt: trial.acknowledgedAt?.toISOString() ?? null,
      candidateName: trial.candidate.name,
    },
    steps: trial.missions.map((mission) => ({
      missionId: mission.id,
      key: mission.template.key,
      sortOrder: mission.template.sortOrder,
      title: mission.template.title,
      kind: mission.template.kind as MissionKind,
      kindLabel: mission.template.kindLabel,
      estMinutes: mission.template.estMinutes,
      dayDue: mission.template.dayDue,
      clientName: mission.template.clientName,
      story: mission.template.story,
      deliverableText: mission.template.deliverableText,
      instructionsText: mission.template.instructionsText,
      contentJson: stripHiddenTargets(mission.template.contentJson),
      status: mission.status,
      secondsSpent: mission.secondsSpent,
      startedAt: mission.startedAt?.toISOString() ?? null,
      completedAt: mission.completedAt?.toISOString() ?? null,
      timerRunning: mission.timerStartedAt !== null,
      submittedText1: mission.submittedText1,
      submittedText2: mission.submittedText2,
      submittedLink: mission.submittedLink,
      revisionPlan: mission.revisionPlan,
      feedback: (mission.feedbackJson as TrialFeedback | null) ?? null,
    })),
  };
}

export async function acknowledgeTrial(
  candidate: ResolvedTrialCandidate,
  input: AcknowledgeRequest,
  now = new Date(),
): Promise<AcknowledgeResponse> {
  const name = input.name?.trim();
  const timezone = input.timezone?.trim();
  const days = input.declaredDays?.filter((day) => VALID_DAYS.has(day));
  if (!name || !timezone || !days?.length || days.length !== input.declaredDays.length || !VALID_BLOCKS.has(input.declaredBlock)) {
    throw new TrialEngineError("VALIDATION", "Name, timezone, valid declared days, and work block are required.");
  }
  const trial = requireTrial(await trialWithMissions(candidate.candidateId));
  const first = trial.missions[0];
  if (!first) throw new TrialEngineError("NO_ACTIVE_PROGRAM", "The active trial has no missions.");
  await db.$transaction([
    db.candidate.update({ where: { candidateId: candidate.candidateId }, data: { name } }),
    db.candidateTrial.update({
      where: { id: trial.id },
      data: { timezone, declaredDays: days.join(","), declaredBlock: input.declaredBlock, acknowledgedAt: now },
    }),
    db.trialEvent.create({
      data: {
        trialId: trial.id,
        day: currentTrialDay(trial.startDate, timezone, now),
        actor: "Candidate",
        type: TRIAL_EVENTS.TRIAL_ACKNOWLEDGED,
        label: `${name} acknowledged the skills trial`,
        dataJson: { timezone, declaredDays: days, declaredBlock: input.declaredBlock },
      },
    }),
  ]);
  return { ok: true, currentStage: candidate.currentStage, nextStepId: first.template.key };
}

async function missionForCandidate(candidateId: string, stepId: string) {
  if (!stepId?.trim()) throw new TrialEngineError("VALIDATION", "Step ID is required.");
  return db.candidateMission.findFirst({
    where: { trial: { candidateId }, template: { key: stepId.trim() } },
    include: { trial: true, template: true },
  });
}

function requireMission<T>(mission: T | null): T {
  if (!mission) throw new TrialEngineError("MISSION_NOT_FOUND", "Mission not found.");
  return mission;
}

export async function startStep(candidateId: string, stepId: string, now = new Date()): Promise<StepStartResponse> {
  const mission = requireMission(await missionForCandidate(candidateId, stepId));
  if (mission.status === "IN_PROGRESS" && mission.timerStartedAt) {
    throw new TrialEngineError("ILLEGAL_TRANSITION", "This mission timer is already running.");
  }
  if (mission.status !== "IN_PROGRESS") assertMissionTransition(mission.status, "IN_PROGRESS");

  await db.$transaction(async (tx) => {
    const running = await tx.candidateMission.findMany({
      where: { trialId: mission.trialId, timerStartedAt: { not: null }, id: { not: mission.id } },
    });
    for (const other of running) {
      const delta = calculateTimerDelta(other.timerStartedAt!, now);
      await tx.candidateMission.update({
        where: { id: other.id },
        data: { timerStartedAt: null, secondsSpent: { increment: delta } },
      });
      await tx.candidateTrial.update({ where: { id: mission.trialId }, data: { activeSeconds: { increment: delta } } });
      await tx.trialEvent.create({
        data: { trialId: mission.trialId, day: currentTrialDay(mission.trial.startDate, mission.trial.timezone, now), actor: "System", type: TRIAL_EVENTS.STEP_PAUSED, label: "Another running mission was auto-paused", dataJson: { missionId: other.id, seconds: delta } },
      });
    }
    const retry = mission.status === "NEEDS_REVISION";
    await tx.candidateMission.update({
      where: { id: mission.id },
      data: {
        status: "IN_PROGRESS",
        timerStartedAt: now,
        startedAt: mission.startedAt ?? now,
        ...(retry
          ? {
              initialText1: mission.initialText1 ?? mission.submittedText1,
              initialText2: mission.initialText2 ?? mission.submittedText2,
              initialLink: mission.initialLink ?? mission.submittedLink,
            }
          : {}),
      },
    });
    await tx.trialEvent.create({
      data: { trialId: mission.trialId, day: currentTrialDay(mission.trial.startDate, mission.trial.timezone, now), actor: "Candidate", type: TRIAL_EVENTS.STEP_STARTED, label: `${retry ? "Retried" : "Started"} ${mission.template.title}`, dataJson: { stepId, serverTimestamp: now.toISOString() } },
    });
  });
  return { ok: true, status: "IN_PROGRESS", startedAt: now.toISOString() };
}

export async function pauseStep(candidateId: string, stepId: string, now = new Date()): Promise<StepPauseResponse> {
  const mission = requireMission(await missionForCandidate(candidateId, stepId));
  if (mission.status !== "IN_PROGRESS" || !mission.timerStartedAt) {
    throw new TrialEngineError("ILLEGAL_TRANSITION", "This mission does not have a running timer.");
  }
  const delta = calculateTimerDelta(mission.timerStartedAt, now);
  const [updated, trial] = await db.$transaction([
    db.candidateMission.update({ where: { id: mission.id }, data: { timerStartedAt: null, secondsSpent: { increment: delta } } }),
    db.candidateTrial.update({ where: { id: mission.trialId }, data: { activeSeconds: { increment: delta } } }),
    db.trialEvent.create({ data: { trialId: mission.trialId, day: currentTrialDay(mission.trial.startDate, mission.trial.timezone, now), actor: "Candidate", type: TRIAL_EVENTS.STEP_PAUSED, label: `Paused ${mission.template.title}`, dataJson: { stepId, seconds: delta } } }),
  ]);
  return { ok: true, secondsSpent: updated.secondsSpent, activeSeconds: trial.activeSeconds };
}

type Scenario = {
  options?: { id?: string; correct?: boolean }[];
  feedbackCorrect?: string;
  feedbackIncorrect?: string;
};

function contentRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function validateStepSubmission(
  kind: MissionKind,
  contentJson: unknown,
  input: StepSubmitRequest,
  isRevision: boolean,
): void {
  const text1 = input.submittedText1?.trim();
  const text2 = input.submittedText2?.trim();
  const link = input.submittedLink?.trim();
  if (isRevision && !input.revisionPlan?.trim()) {
    throw new TrialEngineError("VALIDATION", "A revision plan and ETA are required for resubmission.");
  }
  const checklist = contentRecord(contentJson).checklist;
  if (Array.isArray(checklist) && (!input.checklistChecks || input.checklistChecks.length !== checklist.length || input.checklistChecks.some((checked) => !checked))) {
    throw new TrialEngineError("VALIDATION", "Complete every checklist item before submitting.");
  }
  const valid =
    kind === "learn" ? Boolean(text1) :
    kind === "tour" ? Boolean(link) :
    kind === "sim" ? Boolean(text1 && text2) :
    kind === "sop" ? Boolean(text2) :
    kind === "meet" ? Boolean(text1) :
    kind === "reflect" ? Boolean(text1 || text2 || link) :
    Boolean(text1 || text2 || link);
  if (!valid) throw new TrialEngineError("VALIDATION", `Required submission fields are missing for this ${kind} mission.`);
}

function gradeLearn(contentJson: unknown, answer: string | undefined): AiEvaluationProposal {
  const scenario = contentRecord(contentRecord(contentJson).scenario) as Scenario;
  const selected = scenario.options?.find((option) => option.id === answer?.trim());
  const approved = selected?.correct === true;
  const explanation = approved ? scenario.feedbackCorrect : scenario.feedbackIncorrect;
  return {
    approved,
    feedback: {
      obs: approved ? "The scenario check answer is correct." : "The scenario check answer is not correct yet.",
      impact: approved ? "This shows the expected operating judgment." : "This choice could lead to an avoidable client or workflow risk.",
      sugg: explanation ?? "Review the guidance and choose the response that best protects reliable delivery.",
      enc: approved ? (explanation ?? "Nice work.") : "Review the lesson and try the scenario again.",
    },
  };
}

async function markEvidenceReadyIfComplete(trialId: string, now: Date): Promise<void> {
  const remaining = await db.candidateMission.count({ where: { trialId, status: { not: "APPROVED" } } });
  if (remaining !== 0) return;
  const trial = await db.candidateTrial.findUnique({ where: { id: trialId } });
  if (!trial || trial.status === "SUBMITTED") return;
  await db.$transaction([
    db.candidateTrial.update({ where: { id: trialId }, data: { status: "SUBMITTED" } }),
    db.candidate.update({ where: { candidateId: trial.candidateId }, data: { trainingReadyForReview: true } }),
    db.trialEvent.create({ data: { trialId, day: currentTrialDay(trial.startDate, trial.timezone, now), actor: "System", type: TRIAL_EVENTS.EVIDENCE_READY, label: "All trial missions are approved; evidence is ready" } }),
  ]);
}

export async function submitStep(candidateId: string, input: StepSubmitRequest, now = new Date()): Promise<StepSubmitResponse> {
  const mission = requireMission(await missionForCandidate(candidateId, input.stepId));
  assertMissionTransition(mission.status, "SUBMITTED");
  const isRevision = mission.initialText1 !== null || mission.initialText2 !== null || mission.initialLink !== null || mission.feedbackJson !== null;
  validateStepSubmission(mission.template.kind as MissionKind, mission.template.contentJson, input, isRevision);

  let proposal: AiEvaluationProposal | null = null;
  if (mission.template.kind === "learn") proposal = gradeLearn(mission.template.contentJson, input.submittedText1);
  if (mission.template.kind === "sim") {
    proposal = await evaluateSimSubmission({ trial: mission.trial, mission, template: mission.template, submission: input });
  }
  const finalStatus: MissionStatus = proposal ? (proposal.approved ? "APPROVED" : "NEEDS_REVISION") : "SUBMITTED";
  const delta = mission.timerStartedAt ? calculateTimerDelta(mission.timerStartedAt, now) : 0;
  const day = currentTrialDay(mission.trial.startDate, mission.trial.timezone, now);
  await db.$transaction(async (tx) => {
    await tx.candidateMission.update({
      where: { id: mission.id },
      data: {
        status: finalStatus,
        timerStartedAt: null,
        secondsSpent: { increment: delta },
        completedAt: finalStatus === "APPROVED" ? now : null,
        submittedText1: input.submittedText1?.trim() || null,
        submittedText2: input.submittedText2?.trim() || null,
        submittedLink: input.submittedLink?.trim() || null,
        revisionPlan: input.revisionPlan?.trim() || null,
        feedbackJson: proposal?.feedback as Prisma.InputJsonValue | undefined,
      },
    });
    if (delta) await tx.candidateTrial.update({ where: { id: mission.trialId }, data: { activeSeconds: { increment: delta } } });
    await tx.trialEvent.create({ data: { trialId: mission.trialId, day, actor: "Candidate", type: TRIAL_EVENTS.STEP_SUBMITTED, label: `Submitted ${mission.template.title}`, dataJson: { stepId: input.stepId, submittedLink: input.submittedLink ?? null } } });
    if (isRevision) await tx.trialEvent.create({ data: { trialId: mission.trialId, day, actor: "Candidate", type: TRIAL_EVENTS.REVISION_SUBMITTED, label: `Submitted a revision for ${mission.template.title}`, dataJson: { stepId: input.stepId, revisionPlan: input.revisionPlan! } } });
    if (finalStatus === "APPROVED") await tx.trialEvent.create({ data: { trialId: mission.trialId, day, actor: "AI", type: TRIAL_EVENTS.STEP_APPROVED, label: `${mission.template.title} approved`, dataJson: { stepId: input.stepId } } });
    if (finalStatus === "NEEDS_REVISION") await tx.trialEvent.create({ data: { trialId: mission.trialId, day, actor: "AI", type: TRIAL_EVENTS.REVISION_REQUESTED, label: `${mission.template.title} needs revision`, dataJson: { stepId: input.stepId, feedback: proposal!.feedback } as unknown as Prisma.InputJsonValue } });
  });
  if (finalStatus === "APPROVED") await markEvidenceReadyIfComplete(mission.trialId, now);
  return {
    ok: true,
    status: finalStatus,
    ...(proposal ? { evaluationProposed: { needsRevision: !proposal.approved, feedback: proposal.feedback } } : {}),
  };
}

function messageView(message: TrialMessage & { conversation: { actorType: string } }): TrialMessageView {
  return { id: message.id, conversationId: message.conversationId, actorType: message.conversation.actorType as TrialActorType, timestamp: message.timestamp.toISOString(), day: message.day, from: message.from, text: message.text, tag: message.tag };
}

async function getConversation(trialId: string, actorType: TrialActorType) {
  return db.trialConversation.upsert({
    where: { trialId_actorType: { trialId, actorType } },
    create: { trialId, actorType },
    update: {},
  });
}

export async function replyToMessage(candidateId: string, input: MessageReplyRequest, now = new Date()): Promise<MessageReplyResponse> {
  const trial = requireTrial(await db.candidateTrial.findUnique({ where: { candidateId } }));
  const day = currentTrialDay(trial.startDate, trial.timezone, now);
  if (input.type === "checkin") {
    const answers = input.answers;
    if (!answers || [answers.a, answers.b, answers.c, answers.d].some((answer) => !answer?.trim())) throw new TrialEngineError("VALIDATION", "All four check-in answers are required.");
    const conversation = await getConversation(trial.id, "Purii");
    const text = `Completed: ${answers.a.trim()}\nNext: ${answers.b.trim()}\nBlocked: ${answers.c.trim()}\nETA: ${answers.d.trim()}`;
    await db.$transaction([
      db.trialMessage.create({ data: { conversationId: conversation.id, timestamp: now, day, from: "me", text, tag: "Check-in" } }),
      db.trialEvent.create({ data: { trialId: trial.id, day, actor: "Candidate", type: TRIAL_EVENTS.CHECKIN_SUBMITTED, label: "Daily check-in submitted", dataJson: { ...answers } } }),
      db.trialEvent.create({ data: { trialId: trial.id, day, actor: "Candidate", type: TRIAL_EVENTS.MESSAGE_SENT, label: "Check-in message sent", dataJson: { actorType: "Purii" } } }),
    ]);
    return { ok: true };
  }

  const actorType = input.actorType && VALID_ACTORS.has(input.actorType) ? input.actorType : "Purii";
  const candidateText = input.text?.trim();
  if (!candidateText) throw new TrialEngineError("VALIDATION", "Message text is required.");
  const conversation = await getConversation(trial.id, actorType);
  await db.$transaction([
    db.trialMessage.create({ data: { conversationId: conversation.id, timestamp: now, day, from: "me", text: candidateText } }),
    db.trialEvent.create({ data: { trialId: trial.id, day, actor: "Candidate", type: TRIAL_EVENTS.MESSAGE_SENT, label: `Message sent to ${actorType}`, dataJson: { actorType } } }),
  ]);
  const historyRows = await db.trialMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { timestamp: "asc" }, include: { conversation: { select: { actorType: true } } } });
  const reply = await generateActorReply({ trial, actorType, candidateText, history: historyRows.map(messageView) });
  if (!reply) return { ok: true };
  const created = await db.trialMessage.create({ data: { conversationId: conversation.id, timestamp: now, day, from: actorType.toLowerCase(), text: reply, tag: "AI reply" }, include: { conversation: { select: { actorType: true } } } });
  await logTrialEvent(trial.id, day, "AI", TRIAL_EVENTS.MESSAGE_SENT, `${actorType} replied`, { actorType });
  return { ok: true, reply: messageView(created) };
}

export async function getTrialMessages(candidateId: string): Promise<TrialMessagesResponse> {
  const trial = requireTrial(await db.candidateTrial.findUnique({
    where: { candidateId },
    include: { conversations: { orderBy: { actorType: "asc" }, include: { messages: { orderBy: { timestamp: "asc" } } } } },
  }));
  return {
    ok: true,
    conversations: trial.conversations.map((conversation) => ({
      id: conversation.id,
      actorType: conversation.actorType as TrialActorType,
      messages: conversation.messages.map((message) => messageView({ ...message, conversation: { actorType: conversation.actorType } })),
    })),
  };
}

export async function escalateTrial(candidateId: string, input: EscalateRequest, now = new Date()): Promise<void> {
  if (!(["blocker", "human_help"] as const).includes(input.type) || !input.messageText?.trim()) throw new TrialEngineError("VALIDATION", "Escalation type and message are required.");
  const trial = requireTrial(await db.candidateTrial.findUnique({ where: { candidateId } }));
  const conversation = await getConversation(trial.id, "Human");
  const day = currentTrialDay(trial.startDate, trial.timezone, now);
  const eventType = input.type === "blocker" ? TRIAL_EVENTS.BLOCKER_REPORTED : TRIAL_EVENTS.HUMAN_ESCALATED;
  await db.$transaction([
    db.trialMessage.create({ data: { conversationId: conversation.id, timestamp: now, day, from: "me", text: input.messageText.trim(), tag: input.type === "blocker" ? "Blocker" : "Human help" } }),
    db.trialEvent.create({ data: { trialId: trial.id, day, actor: "Candidate", type: eventType, label: input.type === "blocker" ? "Blocker reported" : "Human help requested", dataJson: { messageText: input.messageText.trim(), stepId: input.stepId ?? null } } }),
    db.trialEvent.create({ data: { trialId: trial.id, day, actor: "Candidate", type: TRIAL_EVENTS.MESSAGE_SENT, label: "Message sent to Human", dataJson: { actorType: "Human" } } }),
  ]);
}
