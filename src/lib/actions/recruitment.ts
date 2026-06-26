import { randomUUID } from "node:crypto";
import type {
  CandidateStage,
  FinalDecision,
  GateResult,
  RecruiterRecommendation,
} from "@prisma/client";
import { logActivity } from "@/lib/activity";
import { db } from "@/lib/db";
import { sendSystemEmail, type SystemEmailResult } from "@/lib/email";
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

    // The recruiter recommends the trial; the candidate now waits on the
    // pre-trial (onboarding-readiness) gate. No trial link is sent until that
    // review passes — see preTrialGate().
    const settings = await loadSettings();
    const candidate = await db.candidate.update({
      where: { candidateId },
      data: {
        finalDecision,
        decidedBy: actorEmail,
        decidedAt: now,
        followUpNotes: note ?? undefined,
        tenhrAssignmentTitle: "VA skills trial",
        currentStage: "tenhr_invited",
      },
    });

    await logActivity({
      source: "recruitment",
      eventType: "pretrial_review_pending",
      summary: `${candidateLabel(candidate)} recommended for the skills trial by ${actorEmail} — awaiting pre-trial review`,
    });

    await emailPreTrialReviewPending(candidate, settings).catch((err) =>
      console.warn("decide: pre-trial review email failed:", err instanceof Error ? err.message : err),
    );
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

const PRETRIAL_RESULTS = ["approve", "decline"] as const;
export type PreTrialResult = (typeof PRETRIAL_RESULTS)[number];

/** Parse + validate the pre-trial gate result. */
export function parsePreTrialResult(result: string): PreTrialResult {
  if (!PRETRIAL_RESULTS.includes(result as PreTrialResult)) {
    throw new Error(`Invalid pre-trial result: ${result}`);
  }
  return result as PreTrialResult;
}

/** Stage a candidate moves to after the pre-trial (onboarding-readiness) gate. */
export function preTrialNextStage(result: PreTrialResult): CandidateStage {
  return result === "approve" ? "tenhr_in_progress" : "decision";
}

/**
 * The pre-trial onboarding-readiness gate (Eunmi). Approve starts the skills
 * trial — generates the tracker token and emails the candidate the link. Decline
 * sends the candidate back to the waitlist. Only valid while the candidate is
 * awaiting this review (stage "tenhr_invited").
 */
export async function preTrialGate(
  candidateId: string,
  result: string,
  notes: string | undefined,
  actorEmail: string,
) {
  const decision = parsePreTrialResult(result);
  const existing = await db.candidate.findUnique({
    where: { candidateId },
    select: { candidateId: true, currentStage: true },
  });
  if (!existing) throw new Error("Candidate not found.");
  if (existing.currentStage !== "tenhr_invited") {
    throw new Error("This candidate is not awaiting a pre-trial review.");
  }

  const now = new Date();
  const settings = await loadSettings();

  if (decision === "approve") {
    const taskCount = await db.trainingAssignment.count({ where: { active: true } });
    if (taskCount === 0) {
      throw new Error("No skills-trial tasks are set up yet. Add them in Recruitment → Skills-Trial Tasks first.");
    }
    const token = randomUUID();
    const candidate = await db.candidate.update({
      where: { candidateId },
      data: {
        currentStage: "tenhr_in_progress",
        tenhrDeadline: addDays(now, 7),
        tenhrAssignmentTitle: "VA skills trial",
        trainingAccessToken: token,
        followUpNotes: notes ?? undefined,
      },
    });
    await logActivity({
      source: "recruitment",
      eventType: "pretrial_approved",
      summary: `Pre-trial review passed for ${candidateLabel(candidate)} by ${actorEmail} — skills-trial invite sent`,
    });
    const sent = await emailSkillsTrialInvite(candidate, token, taskCount, settings);
    if (!sent.ok) {
      // The candidate has advanced but the invite email did not actually send
      // (no Gmail token, redirect/test mode, etc.). Record it loudly so HR can
      // re-send from the pipeline instead of the failure being silent.
      console.warn(`emailSkillsTrialInvite skipped for ${candidate.email}: ${sent.reason}`);
      await logActivity({
        source: "recruitment",
        eventType: "skills_trial_invite_failed",
        summary: `⚠️ Skills-trial invite NOT delivered to ${candidateLabel(candidate)} (${sent.reason}) — use "Resend trial invite" in the pipeline`,
      });
    }
    return candidate;
  }

  const candidate = await db.candidate.update({
    where: { candidateId },
    data: {
      currentStage: "decision",
      finalDecision: "waitlist",
      followUpNotes: notes ?? undefined,
    },
  });
  await logActivity({
    source: "recruitment",
    eventType: "pretrial_declined",
    summary: `Pre-trial review declined for ${candidateLabel(candidate)} by ${actorEmail}${notes ? `: ${notes}` : ""} — moved to waitlist`,
  });
  return candidate;
}

/**
 * Re-send the skills-trial (10-hour) invite email to a candidate who is already
 * mid-trial. Covers the case where the original invite never landed (Gmail
 * hiccup, test-mode redirect, etc.) so HR can recover without resetting the
 * candidate's stage. Unlike the pre-trial gate, this surfaces a send failure as
 * an error so the operator knows immediately whether it actually went out.
 */
export async function resendSkillsTrialInvite(candidateId: string, actorEmail: string) {
  const candidate = await db.candidate.findUnique({
    where: { candidateId },
    select: { candidateId: true, name: true, email: true, currentStage: true, trainingAccessToken: true },
  });
  if (!candidate) throw new Error("Candidate not found.");
  if (candidate.currentStage !== "tenhr_in_progress") {
    throw new Error("Trial invite can only be re-sent while the candidate is in the 10-hour trial.");
  }

  const settings = await loadSettings();
  const taskCount = await db.trainingAssignment.count({ where: { active: true } });
  if (taskCount === 0) {
    throw new Error("No skills-trial tasks are set up yet. Add them in Recruitment → Skills-Trial Tasks first.");
  }

  // Defensive: the tracker token should already exist for an in-progress
  // candidate, but mint one if it's somehow missing so the link is always valid.
  let token = candidate.trainingAccessToken;
  if (!token) {
    token = randomUUID();
    await db.candidate.update({ where: { candidateId }, data: { trainingAccessToken: token } });
  }

  const sent = await emailSkillsTrialInvite(candidate, token, taskCount, settings);
  if (!sent.ok) {
    throw new Error(`Invite email did not send (${sent.reason}). Check the Gmail connection / email settings.`);
  }

  await logActivity({
    source: "recruitment",
    eventType: "skills_trial_invite_resent",
    summary: `Skills-trial invite re-sent to ${candidateLabel(candidate)} by ${actorEmail}`,
  });
  return candidate;
}

/** Notify the gate reviewers (Eunmi + HR) that a candidate finished the trial. */
export async function notifyPostTrialReviewPending(candidate: { name: string | null; email: string }): Promise<void> {
  const settings = await loadSettings();
  const recipients = reviewerRecipients(settings);
  if (recipients.length === 0) return;
  await sendSystemEmail({
    from: systemEmailFrom(settings),
    to: recipients,
    subject: `10-hour gate review needed: ${candidate.name ?? candidate.email}`,
    body: [
      `${candidate.name ?? candidate.email} has completed the 10-hour skills trial and is ready for your gate review.`,
      "",
      `Review here: ${appBaseUrl(settings)}/recruitment/gate`,
    ].join("\n"),
  });
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
): Promise<SystemEmailResult> {
  const trackerLink = `${appBaseUrl(settings)}/track/${token}`;

  return sendSystemEmail({
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
      "Two tools you'll use: put any written work in a Google Doc (set sharing to \"anyone with the link can view\") and paste the link; if a task asks for a video walkthrough, record it free with Loom (loom.com) and paste that link. The checklist page has full instructions.",
      "",
      "Take your time and do your best — we're excited to see what you can do!",
      "",
      "— Pure Water Automations Recruitment",
    ].join("\n"),
  });
}

/** Gate reviewers (Eunmi + HR). Configurable via the gate_reviewer_email setting. */
function reviewerRecipients(settings: Map<string, string>): string[] {
  return uniqueStrings([
    settingStr(settings, "gate_reviewer_email", "eunmirangala@gmail.com"),
    settingStr(settings, "people_ops_email", ""),
    settingStr(settings, "hr_manager_email", ""),
  ]);
}

async function emailPreTrialReviewPending(
  candidate: { name: string | null; email: string },
  settings: Map<string, string>,
): Promise<void> {
  const recipients = reviewerRecipients(settings);
  if (recipients.length === 0) return;
  await sendSystemEmail({
    from: systemEmailFrom(settings),
    to: recipients,
    subject: `Pre-trial review needed: ${candidate.name ?? candidate.email}`,
    body: [
      `${candidate.name ?? candidate.email} has been recommended for the 10-hour skills trial and is awaiting your pre-trial (onboarding-readiness) review.`,
      "",
      "Approve to start their trial and send the tracker link, or decline to send them back to the waitlist.",
      "",
      `Review here: ${appBaseUrl(settings)}/recruitment/gate`,
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
