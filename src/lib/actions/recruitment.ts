import { randomUUID } from "node:crypto";
import type {
  CandidateStage,
  FinalDecision,
  GateResult,
  RecruiterRecommendation,
  TrainingAssignment,
} from "@prisma/client";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { sendSystemEmail } from "@/lib/email";
import { env } from "@/lib/env";
import { REC_STAGES } from "@/lib/reads/recruitment";
import { loadSettings, num as settingNum, str as settingStr } from "@/lib/settings";

export type InterviewScores = {
  comm: number;
  reliability: number;
  ownership: number;
  skillFit: number;
};

const RECOMMENDATIONS: readonly RecruiterRecommendation[] = [
  "recommend_hire",
  "consider",
  "pass",
  "on_waitlist",
];

const FINAL_DECISIONS: readonly FinalDecision[] = ["invite_tenhr", "waitlist", "reject"];
const GATE_RESULTS: readonly GateResult[] = ["pass", "fail", "pending"];
const DAY_MS = 24 * 60 * 60 * 1000;

export async function setStage(
  candidateId: string,
  stage: string,
  note?: string,
) {
  const currentStage = parseStage(stage);
  const candidate = await db.candidate.update({
    where: { candidateId },
    data: { currentStage },
  });

  await logActivity({
    source: "recruitment",
    eventType: "stage_set",
    summary: `Set ${candidateLabel(candidate)} to ${currentStage}${note ? `: ${note}` : ""}`,
  });

  return candidate;
}

export async function saveInterview(
  candidateId: string,
  scores: InterviewScores,
  notes: string | undefined,
  recommendation: string,
  actorEmail: string,
) {
  const validatedScores = validateInterviewScores(scores);
  const recruiterRecommendation = parseRecommendation(recommendation);
  const now = new Date();

  const candidate = await db.candidate.update({
    where: { candidateId },
    data: {
      commScore: validatedScores.comm,
      reliabilityScore: validatedScores.reliability,
      ownershipScore: validatedScores.ownership,
      skillFitScore: validatedScores.skillFit,
      interviewerEmail: actorEmail,
      interviewDate: now,
      interviewNotes: notes ?? null,
      recruiterRecommendation,
      currentStage: "interviewed",
    },
  });

  await logActivity({
    source: "recruitment",
    eventType: "interview_saved",
    summary: `Interview saved for ${candidateLabel(candidate)} by ${actorEmail}`,
  });

  return candidate;
}

export async function decide(
  candidateId: string,
  decision: string,
  note: string | undefined,
  actorEmail: string,
) {
  const finalDecision = parseDecision(decision);
  const now = new Date();

  if (finalDecision === "invite_tenhr") {
    const assignment = await db.trainingAssignment.findFirst({
      where: { active: true },
      orderBy: { createdAt: "asc" },
    });
    if (!assignment) throw new Error("No active training assignment is configured.");

    const settings = await loadSettings();
    const token = randomUUID();
    const candidate = await db.candidate.update({
      where: { candidateId },
      data: {
        finalDecision,
        decidedBy: actorEmail,
        decidedAt: now,
        followUpNotes: note ?? undefined,
        tenhrDeadline: addDays(now, 7),
        tenhrAssignmentTitle: assignment.task,
        tenhrAssignmentLink: assignment.instructionsLink ?? null,
        trainingAccessToken: token,
        currentStage: "tenhr_in_progress",
      },
    });

    await logActivity({
      source: "recruitment",
      eventType: "tenhr_invited",
      summary: `10-hour training invite sent to ${candidateLabel(candidate)} by ${actorEmail}`,
    });

    await emailTenHrInvite(candidate, assignment, token, settings);
    return candidate;
  }

  const currentStage: CandidateStage = finalDecision === "waitlist" ? "decision" : "closed";
  const candidate = await db.candidate.update({
    where: { candidateId },
    data: {
      finalDecision,
      decidedBy: actorEmail,
      decidedAt: now,
      followUpNotes: note ?? undefined,
      currentStage,
    },
  });

  await logActivity({
    source: "recruitment",
    eventType: "decision_recorded",
    summary: `Decision for ${candidateLabel(candidate)}: ${finalDecision}${note ? `: ${note}` : ""}`,
  });

  return candidate;
}

export async function gateReview(
  candidateId: string,
  gateResult: string,
  reviewNotes: string | undefined,
  actorEmail: string,
) {
  const tenhrGateResult = parseGateResult(gateResult);
  const currentStage =
    tenhrGateResult === "pass"
      ? "tenhr_pass"
      : tenhrGateResult === "fail"
        ? "tenhr_fail"
        : undefined;

  const candidate = await db.candidate.update({
    where: { candidateId },
    data: {
      tenhrGateResult,
      gateReviewedBy: actorEmail,
      followUpNotes: reviewNotes ?? undefined,
      ...(currentStage ? { currentStage } : {}),
    },
  });

  await logActivity({
    source: "recruitment",
    eventType: "tenhr_gate_reviewed",
    summary: `10-hour gate ${tenhrGateResult} for ${candidateLabel(candidate)} by ${actorEmail}`,
  });

  return candidate;
}

export async function markContractSent(candidateId: string) {
  const candidate = await db.candidate.findUnique({
    where: { candidateId },
    select: { candidateId: true, name: true, email: true, currentStage: true },
  });
  if (!candidate) throw new Error("Candidate not found.");
  if (candidate.currentStage !== "tenhr_pass") {
    throw new Error("Contract can only be sent after the 10-hour gate is passed.");
  }

  const settings = await loadSettings();
  const deadlineDays = Math.max(0, Math.trunc(settingNum(settings, "contract_deadline_days", 7)));
  const now = new Date();
  const updated = await db.candidate.update({
    where: { candidateId },
    data: {
      contractStatus: "sent",
      contractSentAt: now,
      contractDeadline: addDays(now, deadlineDays),
      currentStage: "contract_sent",
    },
  });

  await logActivity({
    source: "recruitment",
    eventType: "contract_sent",
    summary: `Contract marked sent for ${candidateLabel(updated)}`,
  });

  return updated;
}

export async function markContractSigned(candidateId: string) {
  const candidate = await db.candidate.findUnique({
    where: { candidateId },
    select: {
      candidateId: true,
      name: true,
      email: true,
      currentStage: true,
      vaId: true,
      signedAt: true,
    },
  });
  if (!candidate) throw new Error("Candidate not found.");

  const now = new Date();
  const settings = await loadSettings();

  if (candidate.vaId) {
    const existingVa = await db.va.findUnique({ where: { vaId: candidate.vaId } });
    if (!existingVa) throw new Error(`Linked VA row not found for ${candidate.vaId}.`);

    await db.onboarding.upsert({
      where: { vaId: candidate.vaId },
      update: {},
      create: {
        vaId: candidate.vaId,
        vaName: existingVa.name,
        signedAt: candidate.signedAt ?? now,
        status: "pending",
      },
    });

    await logActivity({
      source: "recruitment",
      eventType: "contract_signed_idempotent",
      summary: `Contract signing already provisioned for ${candidateLabel(candidate)}`,
      vaId: candidate.vaId,
    });

    return db.candidate.update({
      where: { candidateId },
      data: {
        signedAt: candidate.signedAt ?? now,
        contractStatus: "signed",
        currentStage: "onboarding",
      },
    });
  }

  if (candidate.currentStage !== "contract_sent") {
    throw new Error("Contract can only be signed after it has been sent.");
  }

  const existingVa = await db.va.findUnique({ where: { email: candidate.email } });
  const vaName = candidate.name?.trim() || candidate.email.split("@")[0] || candidate.email;
  const provisioned = existingVa
    ? await linkExistingVa(candidate, existingVa.vaId, now)
    : await createVaFromCandidate(candidate, vaName, now);

  await logActivity({
    source: "recruitment",
    eventType: "contract_signed",
    summary: `Provisioned ${provisioned.va.vaId} from ${candidateLabel(candidate)}`,
    vaId: provisioned.va.vaId,
    severity: "success",
  });

  await emailOnboardingNotification(provisioned.candidate, provisioned.va, settings);

  return provisioned.candidate;
}

async function createVaFromCandidate(
  candidate: { candidateId: string; name: string | null; email: string },
  vaName: string,
  now: Date,
) {
  const vaId = await uniqueVaId(makeVaId(vaName, candidate.email));

  return db.$transaction(async (tx) => {
    const va = await tx.va.create({
      data: {
        vaId,
        name: vaName,
        email: candidate.email,
        status: "training",
        compensationRole: "TRAINEE",
        roleStartedDate: now,
      },
    });
    const updatedCandidate = await tx.candidate.update({
      where: { candidateId: candidate.candidateId },
      data: {
        vaId,
        signedAt: now,
        contractStatus: "signed",
        currentStage: "onboarding",
      },
    });
    await tx.onboarding.create({
      data: {
        vaId,
        vaName,
        signedAt: now,
        status: "pending",
      },
    });

    return { candidate: updatedCandidate, va };
  });
}

async function linkExistingVa(
  candidate: { candidateId: string; name: string | null; email: string },
  vaId: string,
  now: Date,
) {
  return db.$transaction(async (tx) => {
    const va = await tx.va.update({
      where: { vaId },
      data: {
        status: "training",
        compensationRole: "TRAINEE",
        roleStartedDate: now,
      },
    });
    const updatedCandidate = await tx.candidate.update({
      where: { candidateId: candidate.candidateId },
      data: {
        vaId,
        signedAt: now,
        contractStatus: "signed",
        currentStage: "onboarding",
      },
    });
    await tx.onboarding.upsert({
      where: { vaId },
      update: {},
      create: {
        vaId,
        vaName: va.name,
        signedAt: now,
        status: "pending",
      },
    });

    return { candidate: updatedCandidate, va };
  });
}

function parseStage(stage: string): CandidateStage {
  if (!REC_STAGES.includes(stage as CandidateStage)) {
    throw new Error(`Invalid recruitment stage: ${stage}`);
  }
  return stage as CandidateStage;
}

function parseRecommendation(recommendation: string): RecruiterRecommendation {
  if (!RECOMMENDATIONS.includes(recommendation as RecruiterRecommendation)) {
    throw new Error(`Invalid interviewer recommendation: ${recommendation}`);
  }
  return recommendation as RecruiterRecommendation;
}

function parseDecision(decision: string): FinalDecision {
  if (!FINAL_DECISIONS.includes(decision as FinalDecision)) {
    throw new Error(`Invalid hiring decision: ${decision}`);
  }
  return decision as FinalDecision;
}

function parseGateResult(gateResult: string): GateResult {
  if (!GATE_RESULTS.includes(gateResult as GateResult)) {
    throw new Error(`Invalid 10-hour gate result: ${gateResult}`);
  }
  return gateResult as GateResult;
}

function validateInterviewScores(scores: InterviewScores): InterviewScores {
  return {
    comm: validateScore("comm", scores.comm),
    reliability: validateScore("reliability", scores.reliability),
    ownership: validateScore("ownership", scores.ownership),
    skillFit: validateScore("skillFit", scores.skillFit),
  };
}

function validateScore(label: keyof InterviewScores, value: number): number {
  if (!Number.isInteger(value) || value < 1 || value > 5) {
    throw new Error(`Interview score ${label} must be an integer from 1 to 5.`);
  }
  return value;
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

function makeVaId(name: string | null | undefined, email: string): string {
  const source = name?.trim() || email.split("@")[0] || "va";
  const parts = source
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
  const firstName = parts[0] ?? "va";
  const lastInitial = parts.length > 1 ? parts[parts.length - 1]?.charAt(0) : "";
  return lastInitial ? `${firstName}_${lastInitial}` : firstName;
}

async function uniqueVaId(baseVaId: string): Promise<string> {
  const base = baseVaId || "va";
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const candidateVaId = suffix === 0 ? base : `${base}_${suffix + 1}`;
    const existing = await db.va.findUnique({
      where: { vaId: candidateVaId },
      select: { vaId: true },
    });
    if (!existing) return candidateVaId;
  }
  throw new Error(`Could not allocate a unique VA ID for ${base}.`);
}

async function emailTenHrInvite(
  candidate: { name: string | null; email: string },
  assignment: Pick<TrainingAssignment, "task" | "instructions" | "instructionsLink">,
  token: string,
  settings: Map<string, string>,
): Promise<void> {
  const trackerLink = `${appBaseUrl(settings)}/track/${token}`;
  const assignmentLink = assignment.instructionsLink
    ? `\nAssignment link: ${assignment.instructionsLink}`
    : "";
  const instructions = assignment.instructions ? `\n\nInstructions:\n${assignment.instructions}` : "";

  await sendSystemEmail({
    from: systemEmailFrom(settings),
    to: candidate.email,
    subject: "Your 10-hour training assignment",
    body: [
      `Hi ${firstName(candidate.name) || "there"},`,
      "",
      "You have been invited to the 10-hour training stage.",
      "",
      `Tracker: ${trackerLink}`,
      `Assignment: ${assignment.task}${assignmentLink}`,
      instructions,
      "",
      "Use the tracker link to log your training time and submit your work for review.",
    ].join("\n"),
  });
}

async function emailOnboardingNotification(
  candidate: { name: string | null; email: string; vaId: string | null },
  va: { vaId: string; name: string; email: string },
  settings: Map<string, string>,
): Promise<void> {
  const recipients = notificationRecipients(settings);
  if (recipients.length === 0) return;

  await sendSystemEmail({
    from: systemEmailFrom(settings),
    to: recipients,
    subject: `New VA ready for onboarding: ${va.name}`,
    body: [
      `${va.name} signed their contract and has been provisioned for onboarding.`,
      "",
      `VA ID: ${va.vaId}`,
      `Email: ${va.email}`,
      `Candidate: ${candidate.name ?? candidate.email}`,
    ].join("\n"),
  });
}

function systemEmailFrom(settings: Map<string, string>): string {
  return (
    settingStr(settings, "system_email_from", "").trim() ||
    settingStr(settings, "hr_manager_email", "").trim() ||
    "okamotomiak@gmail.com"
  );
}

function appBaseUrl(settings: Map<string, string>): string {
  const configuredBase = env.APP_BASE_URL ?? settingStr(settings, "app_base_url", "").trim();
  return (configuredBase || "http://localhost:3032").replace(/\/+$/, "");
}

function notificationRecipients(settings: Map<string, string>): string[] {
  return uniqueStrings([
    settingStr(settings, "aira_email", "aira.purewaterautomations@gmail.com"),
    settingStr(settings, "hr_manager_email", "okamotomiak@gmail.com"),
    settingStr(settings, "people_ops_email", ""),
  ]);
}

function uniqueStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed.toLowerCase())) continue;
    seen.add(trimmed.toLowerCase());
    result.push(trimmed);
  }
  return result;
}

function candidateLabel(candidate: { name: string | null; email: string }): string {
  return candidate.name ? `${candidate.name} <${candidate.email}>` : candidate.email;
}

function firstName(name: string | null): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}
