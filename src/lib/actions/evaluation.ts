/**
 * Trainee / tier evaluation actions — the dual self+supervisor assessment flow
 * that gates a TRAINEE → TIER_1 graduation (and, with the tier rubric, a
 * tier-to-tier promotion). Replaces the legacy GAS Evaluation.gs engine
 * (HR_startTraineeEvaluation / submit handlers / HR_approve|declineEvaluation),
 * but with NATIVE in-app forms instead of Google Forms.
 */
import type { CompRole, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { baselineCutover, deskLogSinceCutover, withBaseline } from "@/lib/services/cumulative";
import { sendSystemEmail, type SystemEmailResult } from "@/lib/email";
import {
  averageScore,
  combinedScore,
  nextStatus,
  autoRecommendation,
  type RubricKind,
  type SupervisorRecommendation,
} from "@/lib/services/evaluation-rubric";

const NEXT_TIER: Record<CompRole, CompRole | null> = {
  TRAINEE: "TIER_1",
  TIER_1: "TIER_2",
  TIER_2: "TIER_3",
  TIER_3: "TIER_4",
  TIER_4: null,
};

const DECIDED = new Set(["approved", "declined"]);

export type AssessmentInput = {
  scores: Record<string, number>;
  narratives?: Record<string, string>;
  portfolioUrl?: string;
};

// ── Start ──────────────────────────────────────────────────────────────────

export async function startEvaluation(
  vaId: string,
  opts: { stage?: string } = {},
  actorEmail: string,
) {
  const targetVaId = requireText(vaId, "vaId");
  const va = await db.va.findUnique({ where: { vaId: targetVaId } });
  if (!va) throw new Error(`VA not found: ${targetVaId}`);

  const existingOpen = await db.evaluation.findFirst({
    where: { vaId: targetVaId, status: { notIn: ["approved", "declined"] } },
    select: { evaluationId: true },
  });
  if (existingOpen) {
    throw new Error(`An evaluation is already in progress for ${va.name}.`);
  }

  const rubric: RubricKind = va.compensationRole === "TRAINEE" ? "TRAINEE" : "TIER";
  const targetRole = await resolveNextRole(va.compensationRole);
  if (!targetRole) throw new Error(`${va.name} is at the top of the ladder — no next role to evaluate for.`);
  const stage = opts.stage?.trim() || (rubric === "TRAINEE" ? "final" : `${va.compensationRole.toLowerCase()}_to_${targetRole.toLowerCase()}`);

  const cumulativeHours = await cumulativeHoursFor(targetVaId);

  const evaluation = await db.$transaction(async (tx) => {
    const review = await tx.tierReview.create({
      data: {
        vaId: targetVaId,
        vaName: va.name,
        currentRole: va.compensationRole,
        targetRole,
        cumulativeHoursAtTrigger: cumulativeHours,
        status: "under_review",
      },
    });
    return tx.evaluation.create({
      data: {
        tierReviewId: review.id,
        vaId: targetVaId,
        vaName: va.name,
        rubric,
        stage,
        status: "forms_sent",
        supervisorVaId: va.supervisorVaId,
      },
    });
  });

  // Best-effort notifications: ping the VA (self-assessment) + supervisor.
  const from = await getSettingValue("system_email_from");
  const base = env.APP_BASE_URL || "https://dev-team.pwasecondbrain.uk";
  if (from) {
    if (va.email) {
      await safeEmail({
        from,
        to: va.email,
        subject: "Action needed: your evaluation self-assessment",
        body: `Hi ${firstName(va.name)},\n\nYou have an evaluation self-assessment to complete. Open your console and fill it in here:\n\n${base}/va/tier`,
      });
    }
    const supervisor = va.supervisorVaId
      ? await db.va.findUnique({ where: { vaId: va.supervisorVaId }, select: { name: true, email: true } })
      : null;
    if (supervisor?.email) {
      await safeEmail({
        from,
        to: supervisor.email,
        subject: `Action needed: supervisor assessment for ${va.name}`,
        body: `Hi ${firstName(supervisor.name ?? "")},\n\nPlease complete the supervisor assessment for ${va.name}'s evaluation:\n\n${base}/va/tier`,
      });
    }
  }

  await logActivity({
    source: "hr_action",
    eventType: "evaluation_started",
    vaId: targetVaId,
    severity: "info",
    summary: `Evaluation started for ${va.name} (${rubric.toLowerCase()} → ${targetRole}) by ${actorEmail}`,
  });
  return evaluation;
}

// ── Submissions (native forms) ───────────────────────────────────────────────

export async function submitSelfAssessment(
  evaluationId: string,
  input: AssessmentInput,
  actorVaId: string,
  actorEmail: string,
  opts: { isAdmin?: boolean } = {},
) {
  const evaluation = await loadOpen(evaluationId);
  if (!opts.isAdmin && evaluation.vaId !== actorVaId) {
    throw new Error("This self-assessment isn't yours to submit.");
  }
  const score = averageScore(evaluation.rubric, input.scores);
  const selfJson = packAssessment(input);

  const updated = await recomputeAndSave(evaluation.evaluationId, {
    selfSubmittedAt: new Date(),
    selfScore: score,
    selfJson,
  });

  await logActivity({
    source: "evaluation",
    eventType: "self_assessment_submitted",
    vaId: evaluation.vaId,
    severity: "info",
    summary: `${evaluation.vaName ?? evaluation.vaId} submitted their self-assessment (avg ${score}) — ${actorEmail}`,
  });
  return updated;
}

export async function submitSupervisorAssessment(
  evaluationId: string,
  input: AssessmentInput & { recommendation: SupervisorRecommendation },
  actorVaId: string | null,
  actorEmail: string,
  opts: { isAdmin?: boolean } = {},
) {
  const evaluation = await loadOpen(evaluationId);
  if (!opts.isAdmin && evaluation.supervisorVaId && evaluation.supervisorVaId !== actorVaId) {
    throw new Error("You're not the assigned supervisor for this evaluation.");
  }
  const score = averageScore(evaluation.rubric, input.scores);
  const supervisorJson = packAssessment(input);

  const updated = await recomputeAndSave(evaluation.evaluationId, {
    supervisorSubmittedAt: new Date(),
    supervisorScore: score,
    supervisorRecommendation: input.recommendation,
    supervisorJson,
  });

  await logActivity({
    source: "evaluation",
    eventType: "supervisor_assessment_submitted",
    vaId: evaluation.vaId,
    severity: "info",
    summary: `Supervisor assessment submitted for ${evaluation.vaName ?? evaluation.vaId} (avg ${score}, ${input.recommendation}) — ${actorEmail}`,
  });
  return updated;
}

// ── HR decision ──────────────────────────────────────────────────────────────

export async function approveEvaluation(
  evaluationId: string,
  opts: { targetRole?: CompRole; hrNotes?: string },
  actorEmail: string,
) {
  const id = requireText(evaluationId, "evaluationId");
  const bookkeeperEmail = await getSettingValue("bookkeeper_email");
  const fromEmail = bookkeeperEmail ? await getSettingValue("system_email_from") : null;
  const now = new Date();

  const result = await db.$transaction(async (tx) => {
    const evaluation = await tx.evaluation.findUnique({ where: { evaluationId: id }, include: { tierReview: true } });
    if (!evaluation) throw new Error(`Evaluation not found: ${id}`);
    if (DECIDED.has(evaluation.status)) throw new Error("This evaluation is already decided.");

    const va = await tx.va.findUnique({ where: { vaId: evaluation.vaId } });
    if (!va) throw new Error(`VA not found: ${evaluation.vaId}`);

    const targetRole = opts.targetRole ?? evaluation.tierReview.targetRole ?? (await resolveNextRoleTx(tx, va.compensationRole));
    if (!targetRole) throw new Error("No target role to promote into.");

    const updatedVa = await tx.va.update({
      where: { vaId: va.vaId },
      data: {
        compensationRole: targetRole,
        roleStartedDate: now,
        status: va.status === "training" ? "active" : va.status,
      },
    });
    await tx.tierReview.update({
      where: { id: evaluation.tierReviewId },
      data: { status: "approved", hrDecisionDate: now, targetRole, hrNotes: cleanText(opts.hrNotes) ?? null },
    });
    const updatedEval = await tx.evaluation.update({
      where: { evaluationId: id },
      data: { status: "approved", decision: "approved", decidedAt: now, decidedBy: actorEmail, hrNotes: cleanText(opts.hrNotes) ?? null },
    });

    return { previousRole: va.compensationRole, targetRole, va: updatedVa, evaluation: updatedEval };
  });

  let email: SystemEmailResult | null = null;
  if (bookkeeperEmail && fromEmail) {
    email = await safeEmail({
      from: fromEmail,
      to: bookkeeperEmail,
      subject: `Rate change: ${result.va.name} to ${result.targetRole}`,
      body: `${result.va.name} approved for ${result.targetRole} via evaluation. New rate effective next pay period.`,
    });
  }

  await logActivity({
    source: "hr_action",
    eventType: "evaluation_approved",
    vaId: result.va.vaId,
    severity: "success",
    summary: `${result.va.name} approved ${result.previousRole} → ${result.targetRole} via evaluation by ${actorEmail}${emailSummary(email)}`,
  });
  return { ...result, email };
}

export async function declineEvaluation(
  evaluationId: string,
  opts: { hrNotes?: string },
  actorEmail: string,
) {
  const id = requireText(evaluationId, "evaluationId");
  const now = new Date();

  const updated = await db.$transaction(async (tx) => {
    const evaluation = await tx.evaluation.findUnique({ where: { evaluationId: id } });
    if (!evaluation) throw new Error(`Evaluation not found: ${id}`);
    if (DECIDED.has(evaluation.status)) throw new Error("This evaluation is already decided.");
    await tx.tierReview.update({
      where: { id: evaluation.tierReviewId },
      data: { status: "declined", hrDecisionDate: now, hrNotes: cleanText(opts.hrNotes) ?? null },
    });
    return tx.evaluation.update({
      where: { evaluationId: id },
      data: { status: "declined", decision: "declined", decidedAt: now, decidedBy: actorEmail, hrNotes: cleanText(opts.hrNotes) ?? null },
    });
  });

  await logActivity({
    source: "hr_action",
    eventType: "evaluation_declined",
    vaId: updated.vaId,
    severity: "warning",
    summary: `Evaluation declined for ${updated.vaName ?? updated.vaId} by ${actorEmail} — VA continues at current level`,
  });
  return updated;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function loadOpen(evaluationId: string) {
  const id = requireText(evaluationId, "evaluationId");
  const evaluation = await db.evaluation.findUnique({ where: { evaluationId: id } });
  if (!evaluation) throw new Error(`Evaluation not found: ${id}`);
  if (DECIDED.has(evaluation.status)) throw new Error("This evaluation is already decided.");
  return evaluation;
}

async function recomputeAndSave(evaluationId: string, patch: Prisma.EvaluationUpdateInput) {
  const current = await db.evaluation.findUnique({ where: { evaluationId } });
  if (!current) throw new Error(`Evaluation not found: ${evaluationId}`);

  const selfScore = "selfScore" in patch ? (patch.selfScore as number | null) : current.selfScore;
  const supervisorScore = "supervisorScore" in patch ? (patch.supervisorScore as number | null) : current.supervisorScore;
  const selfSubmitted = "selfSubmittedAt" in patch ? true : current.selfSubmittedAt != null;
  const supervisorSubmitted = "supervisorSubmittedAt" in patch ? true : current.supervisorSubmittedAt != null;

  const combined = combinedScore(selfScore, supervisorScore);
  const supervisorJson = "supervisorJson" in patch ? (patch.supervisorJson as { scores?: Record<string, number> } | null) : (current.supervisorJson as { scores?: Record<string, number> } | null);
  const supervisorRecommendation = ("supervisorRecommendation" in patch ? (patch.supervisorRecommendation as string | null) : current.supervisorRecommendation) as SupervisorRecommendation | null;

  const auto = autoRecommendation({
    kind: current.rubric,
    combined,
    supervisorScores: supervisorJson?.scores ?? null,
    supervisorRecommendation,
  });

  return db.evaluation.update({
    where: { evaluationId },
    data: {
      ...patch,
      combinedScore: combined,
      autoRecommendation: auto,
      status: nextStatus({ selfSubmitted, supervisorSubmitted }),
    },
  });
}

function packAssessment(input: AssessmentInput & { recommendation?: SupervisorRecommendation }): Prisma.InputJsonValue {
  return {
    scores: input.scores,
    narratives: input.narratives ?? {},
    ...(input.portfolioUrl ? { portfolioUrl: input.portfolioUrl } : {}),
    ...(input.recommendation ? { recommendation: input.recommendation } : {}),
  };
}

async function resolveNextRole(currentRole: CompRole): Promise<CompRole | null> {
  return resolveNextRoleTx(db, currentRole);
}

async function resolveNextRoleTx(
  client: Prisma.TransactionClient | typeof db,
  currentRole: CompRole,
): Promise<CompRole | null> {
  const role = await client.compensationRole.findUnique({ where: { roleId: currentRole }, select: { nextRoleId: true } });
  return role?.nextRoleId ?? NEXT_TIER[currentRole];
}

async function cumulativeHoursFor(vaId: string): Promise<number> {
  const cutover = await baselineCutover();
  const [agg, va] = await Promise.all([
    db.deskLogHours.aggregate({ where: { vaId, ...deskLogSinceCutover(cutover) }, _sum: { taskSpentHrs: true } }),
    db.va.findUnique({ where: { vaId }, select: { baselineHours: true } }),
  ]);
  return Math.round(withBaseline(va?.baselineHours, agg._sum.taskSpentHrs ?? 0) * 100) / 100;
}

async function getSettingValue(key: string): Promise<string | null> {
  const row = await db.setting.findUnique({ where: { key }, select: { value: true } });
  const text = row?.value?.trim();
  return text ? text : null;
}

async function safeEmail(input: { from: string; to: string; subject: string; body: string }): Promise<SystemEmailResult | null> {
  try {
    return await sendSystemEmail(input);
  } catch {
    return null;
  }
}

function requireText(value: string | undefined, fieldName: string): string {
  const text = value?.trim();
  if (!text) throw new Error(`Missing field: ${fieldName}`);
  return text;
}

function cleanText(value: string | null | undefined): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text ? text : undefined;
}

function firstName(name: string): string {
  return name?.trim().split(/\s+/)[0] || "there";
}

function emailSummary(result: SystemEmailResult | null): string {
  if (!result || result.ok) return "";
  return ` Bookkeeper email skipped: ${result.reason}.`;
}
