import { randomUUID } from "node:crypto";
import type {
  CandidateStage,
  FinalDecision,
  GateResult,
  RecruiterRecommendation,
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
    const taskCount = await db.trainingAssignment.count({ where: { active: true } });
    if (taskCount === 0) {
      throw new Error("No skills-trial tasks are set up yet. Add them in Recruitment → Skills-Trial Tasks first.");
    }

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
        tenhrAssignmentTitle: "VA skills trial",
        tenhrAssignmentLink: null,
        trainingAccessToken: token,
        currentStage: "tenhr_in_progress",
      },
    });

    await logActivity({
      source: "recruitment",
      eventType: "tenhr_invited",
      summary: `Skills-trial invite sent to ${candidateLabel(candidate)} by ${actorEmail}`,
    });

    await emailSkillsTrialInvite(candidate, token, taskCount, settings);
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
  const token = randomUUID();
  const updated = await db.candidate.update({
    where: { candidateId },
    data: {
      contractStatus: "sent",
      contractSentAt: now,
      contractDeadline: addDays(now, deadlineDays),
      currentStage: "contract_sent",
      contractSignToken: token,
    },
  });

  await emailContractLink(updated, token, settings).catch((err) =>
    console.warn("markContractSent: link email failed:", err instanceof Error ? err.message : err),
  );

  await logActivity({
    source: "recruitment",
    eventType: "contract_sent",
    summary: `Contract link sent to ${candidateLabel(updated)}`,
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

/**
 * Email the candidate their intro video and/or interview-booking link, and move
 * them to "interview scheduled". The links live in settings (intro_video_url /
 * interview_booking_url) and can be set from the console.
 */
export async function sendInterviewInvite(candidateId: string, actorEmail: string) {
  const candidate = await db.candidate.findUnique({
    where: { candidateId },
    select: { candidateId: true, name: true, email: true },
  });
  if (!candidate) throw new Error("Candidate not found.");

  const settings = await loadSettings();
  const videoUrl = settingStr(settings, "intro_video_url", "").trim();
  const bookingUrl = settingStr(settings, "interview_booking_url", "").trim();
  if (!videoUrl && !bookingUrl) {
    throw new Error("No intro-video or interview-booking link is set yet. Set one in “Interview links” at the top of the pipeline.");
  }

  const lines = [
    `Hi ${firstName(candidate.name) || "there"},`,
    "",
    "Thanks for applying to the Pure Water Automations virtual assistant team — we'd like to move you to the interview step.",
    "",
  ];
  if (videoUrl) lines.push(`▶ Watch this short intro video first: ${videoUrl}`, "");
  if (bookingUrl) lines.push(`📅 Then book / complete your interview here: ${bookingUrl}`, "");
  lines.push("Reply to this email if you have any questions. We look forward to speaking with you!", "", "— Pure Water Automations Recruitment");

  const email = await sendSystemEmail({
    from: systemEmailFrom(settings),
    to: candidate.email,
    subject: "Next step: your Pure Water VA interview",
    body: lines.join("\n"),
  });

  const updated = await db.candidate.update({
    where: { candidateId },
    data: { currentStage: "interview_scheduled" },
  });

  await logActivity({
    source: "recruitment",
    eventType: "interview_invite_sent",
    summary: `Interview invite emailed to ${candidateLabel(updated)} by ${actorEmail}`,
  });
  return { candidate: updated, email };
}

/** Set the recruitment links used by the interview invite (admin/HR). */
export async function setRecruitmentLinks(
  bookingUrl: string | undefined,
  videoUrl: string | undefined,
  actorEmail: string,
) {
  const ups: Promise<unknown>[] = [];
  if (bookingUrl !== undefined) {
    ups.push(db.setting.upsert({ where: { key: "interview_booking_url" }, update: { value: bookingUrl.trim() }, create: { key: "interview_booking_url", value: bookingUrl.trim() } }));
  }
  if (videoUrl !== undefined) {
    ups.push(db.setting.upsert({ where: { key: "intro_video_url" }, update: { value: videoUrl.trim() }, create: { key: "intro_video_url", value: videoUrl.trim() } }));
  }
  await Promise.all(ups);
  await logActivity({ source: "recruitment", eventType: "recruitment_links_set", summary: `Interview/video links updated by ${actorEmail}` });
  return { ok: true };
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

async function emailSkillsTrialInvite(
  candidate: { name: string | null; email: string },
  token: string,
  taskCount: number,
  settings: Map<string, string>,
): Promise<void> {
  const trackerLink = `${appBaseUrl(settings)}/track/${token}`;

  await sendSystemEmail({
    from: systemEmailFrom(settings),
    to: candidate.email,
    subject: "Next step: your Pure Water VA skills trial",
    body: [
      `Hi ${firstName(candidate.name) || "there"},`,
      "",
      `Congratulations — you're invited to our short VA skills trial. It's ${taskCount} quick tasks (about 10–30 minutes each) covering the core skills our VAs use day to day.`,
      "",
      `Open your checklist here: ${trackerLink}`,
      "",
      "For each task: start the timer, do the work, and mark it done (you can paste a link to your work). Once all tasks are complete, you're automatically submitted for review — no need to email us back.",
      "",
      "Take your time and do your best — we're excited to see what you can do!",
      "",
      "— Pure Water Automations Recruitment",
    ].join("\n"),
  });
}

async function emailContractLink(
  candidate: { name: string | null; email: string },
  token: string,
  settings: Map<string, string>,
): Promise<void> {
  const link = `${appBaseUrl(settings)}/sign/${token}`;
  await sendSystemEmail({
    from: systemEmailFrom(settings),
    to: candidate.email,
    subject: "Your Pure Water VA contract is ready to sign",
    body: [
      `Hi ${firstName(candidate.name) || "there"},`,
      "",
      "Congratulations! Your contract is ready. Please review and sign it here:",
      "",
      link,
      "",
      "It only takes a minute — read it, type your name, sign, and submit.",
      "",
      "— Pure Water Automations",
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
