// PWA Skills Trial — email notification wrapper with Stage-1 Kill Switch (docs/skills-trial/14 §1).
// Sends ONLY when process.env.TRIAL_EMAILS_ENABLED === 'true'; otherwise logs to console as dry-run.
// NOTE: Non-ASCII subjects automatically go through RFC-2047 encoding inside sendSystemEmail -> buildMimeMessage (email.ts encodeHeaderWord).

import { sendSystemEmail, type SystemEmailOptions, type SystemEmailResult } from "@/lib/email";
import { env } from "@/lib/env";

/**
 * Stage-1 Kill Switch wrapper over sendSystemEmail.
 */
export async function sendTrialEmail(opts: SystemEmailOptions): Promise<SystemEmailResult> {
  const enabled = process.env.TRIAL_EMAILS_ENABLED === "true";
  if (!enabled) {
    console.log("[trial-email:DRY-RUN]", { to: opts.to, subject: opts.subject });
    return { ok: true, id: null };
  }

  return sendSystemEmail(opts);
}

/**
 * Get comma-separated list of reviewer emails from process.env.TRIAL_REVIEWER_EMAILS.
 * Defaults to empty array if not configured.
 */
export function getReviewerEmails(): string[] {
  const raw = process.env.TRIAL_REVIEWER_EMAILS || "";
  return raw
    .split(",")
    .map((e) => e.trim())
    .filter((e) => Boolean(e));
}

/**
 * Base URL for links inside trial notifications.
 */
export function getBaseUrl(): string {
  return env.APP_BASE_URL ?? process.env.APP_BASE_URL ?? "https://team.pwasecondbrain.uk";
}

/**
 * Template 1: Candidate Invitation with magic link.
 */
export async function notifyCandidateInvitation(
  candidateEmail: string,
  candidateName: string | null,
  token: string
): Promise<SystemEmailResult> {
  const baseUrl = getBaseUrl();
  const magicLink = `${baseUrl}/track/${encodeURIComponent(token)}`;
  const displayName = candidateName?.trim() || "Candidate";
  const subject = `Welcome to the PWA Skills Trial — ${displayName}`;

  const body = `Hi ${displayName},

Welcome to the PWA Skills Trial! Your simulated work week has been initialized and is ready for you to begin.

To access your Mission Control and declare your preferred work window, please use your personal link below:
${magicLink}

Best of luck!
The PWA Team`;

  const htmlBody = `<div style="font-family: sans-serif; line-height: 1.5; color: #333;">
    <p>Hi ${displayName},</p>
    <p>Welcome to the <strong>PWA Skills Trial</strong>! Your simulated work week has been initialized and is ready for you to begin.</p>
    <p>To access your Mission Control and declare your preferred work window, click your personal link below:</p>
    <p style="margin: 24px 0;">
      <a href="${magicLink}" style="background-color: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600;">Open Mission Control</a>
    </p>
    <p style="font-size: 13px; color: #666;">Or copy and paste this link into your browser: <br/><a href="${magicLink}">${magicLink}</a></p>
    <p>Best of luck!<br/><strong>The PWA Team</strong></p>
  </div>`;

  return sendTrialEmail({
    from: process.env.SYSTEM_EMAIL_FROM || "notifications@team.pwasecondbrain.uk",
    to: candidateEmail,
    subject,
    body,
    htmlBody,
  });
}

/**
 * Template 2: Daily Briefing Digest (optional email digest; primary channel is Purii in-app message).
 */
export async function notifyDailyBriefing(
  candidateEmail: string,
  candidateName: string | null,
  dayNum: number,
  dueSteps: string[]
): Promise<SystemEmailResult> {
  const baseUrl = getBaseUrl();
  const displayName = candidateName?.trim() || "Candidate";
  const subject = `Day ${dayNum} Briefing — PWA Skills Trial`;

  const itemsText = dueSteps.length > 0
    ? dueSteps.map((s, i) => `• ${i + 1}. ${s}`).join("\n")
    : "• No specific steps due today — use this time to review work or prepare ahead.";

  const itemsHtml = dueSteps.length > 0
    ? `<ul>${dueSteps.map((s) => `<li><strong>${s}</strong></li>`).join("")}</ul>`
    : `<p>No specific steps due today — use this time to review work or prepare ahead.</p>`;

  const body = `Hi ${displayName},

Here is your daily briefing digest for Day ${dayNum} of your PWA Skills Trial:

${itemsText}

Log in to Mission Control to view full instructions and chat with Purii:
${baseUrl}/track

Best,
The PWA Team`;

  const htmlBody = `<div style="font-family: sans-serif; line-height: 1.5; color: #333;">
    <p>Hi ${displayName},</p>
    <p>Here is your daily briefing digest for <strong>Day ${dayNum}</strong> of your PWA Skills Trial:</p>
    ${itemsHtml}
    <p><a href="${baseUrl}/track">Log in to Mission Control</a> to view full instructions and chat with Purii.</p>
    <p>Best,<br/><strong>The PWA Team</strong></p>
  </div>`;

  return sendTrialEmail({
    from: process.env.SYSTEM_EMAIL_FROM || "notifications@team.pwasecondbrain.uk",
    to: candidateEmail,
    subject,
    body,
    htmlBody,
  });
}

/**
 * Helper to check and notify reviewers. If TRIAL_REVIEWER_EMAILS is empty, logs and returns success.
 */
async function notifyReviewers(
  subject: string,
  body: string,
  htmlBody: string
): Promise<SystemEmailResult> {
  const reviewers = getReviewerEmails();
  if (reviewers.length === 0) {
    console.log("[trial-email:REVIEWER-SKIP] No TRIAL_REVIEWER_EMAILS configured", { subject });
    return { ok: true, id: null };
  }

  return sendTrialEmail({
    from: process.env.SYSTEM_EMAIL_FROM || "notifications@team.pwasecondbrain.uk",
    to: reviewers,
    subject,
    body,
    htmlBody,
  });
}

/**
 * Template 3: Evidence Ready Reviewer Alert.
 */
export async function notifyReviewersEvidenceReady(
  trialId: string,
  candidateId: string,
  candidateName: string | null,
  candidateEmail: string
): Promise<SystemEmailResult> {
  const baseUrl = getBaseUrl();
  const displayName = candidateName?.trim() ? `${candidateName.trim()} (${candidateEmail})` : candidateEmail;
  const subject = `[Evidence Ready] PWA Skills Trial — ${displayName}`;
  const reviewUrl = `${baseUrl}/recruitment/gate/trial/${encodeURIComponent(candidateId)}`;

  const body = `Reviewer Alert: Evidence Packet Ready

Candidate ${displayName} has completed all steps and their submissions have been approved.
Trial ID: ${trialId}

Review their evidence graph, AI evaluation proposals, and make the final gate decision here:
${reviewUrl}`;

  const htmlBody = `<div style="font-family: sans-serif; line-height: 1.5; color: #333;">
    <h3 style="color: #059669;">Evidence Packet Ready for Review</h3>
    <p>Candidate <strong>${displayName}</strong> has completed all missions and their submissions have been approved.</p>
    <p><strong>Trial ID:</strong> <code>${trialId}</code></p>
    <p style="margin: 20px 0;">
      <a href="${reviewUrl}" style="background-color: #059669; color: white; padding: 10px 20px; text-decoration: none; border-radius: 6px;">Open Reviewer Console</a>
    </p>
  </div>`;

  return notifyReviewers(subject, body, htmlBody);
}

/**
 * Template 4: Deadline Passed Reviewer Alert.
 */
export async function notifyReviewersDeadlinePassed(
  trialId: string,
  candidateId: string,
  candidateName: string | null,
  candidateEmail: string,
  deadlineDate: Date
): Promise<SystemEmailResult> {
  const baseUrl = getBaseUrl();
  const displayName = candidateName?.trim() ? `${candidateName.trim()} (${candidateEmail})` : candidateEmail;
  const subject = `[Deadline Passed] PWA Skills Trial — ${displayName}`;
  const reviewUrl = `${baseUrl}/recruitment/gate/trial/${encodeURIComponent(candidateId)}`;
  const deadlineStr = deadlineDate.toISOString().slice(0, 10);

  const body = `Reviewer Alert: Candidate Deadline Passed

Candidate ${displayName} has passed their trial deadline (${deadlineStr}) with unapproved steps remaining.
Trial ID: ${trialId}

Please check their status and decide whether to close or extend the trial:
${reviewUrl}`;

  const htmlBody = `<div style="font-family: sans-serif; line-height: 1.5; color: #333;">
    <h3 style="color: #dc2626;">Candidate Deadline Passed</h3>
    <p>Candidate <strong>${displayName}</strong> has passed their trial deadline (<strong>${deadlineStr}</strong>) with unapproved steps remaining.</p>
    <p><strong>Trial ID:</strong> <code>${trialId}</code></p>
    <p><a href="${reviewUrl}">View in Reviewer Console</a></p>
  </div>`;

  return notifyReviewers(subject, body, htmlBody);
}

/**
 * Template 5: Human Escalation Reviewer Alert.
 */
export async function notifyReviewersHumanEscalation(
  trialId: string,
  candidateId: string,
  candidateName: string | null,
  candidateEmail: string,
  escalationText: string
): Promise<SystemEmailResult> {
  const baseUrl = getBaseUrl();
  const displayName = candidateName?.trim() ? `${candidateName.trim()} (${candidateEmail})` : candidateEmail;
  const subject = `[Human Escalation] PWA Skills Trial — ${displayName}`;
  const reviewUrl = `${baseUrl}/recruitment/gate/trial/${encodeURIComponent(candidateId)}`;

  const body = `Reviewer Alert: Human Escalation Requested

Candidate ${displayName} has escalated an issue or requested human assistance during their skills trial.
Reason / Message: "${escalationText}"
Trial ID: ${trialId}

Please review their Mission Control messages and reply promptly:
${reviewUrl}`;

  const htmlBody = `<div style="font-family: sans-serif; line-height: 1.5; color: #333;">
    <h3 style="color: #d97706;">Human Escalation Requested</h3>
    <p>Candidate <strong>${displayName}</strong> has requested human intervention during their skills trial.</p>
    <blockquote style="border-left: 4px solid #d97706; margin: 16px 0; padding-left: 16px; font-style: italic;">
      ${escalationText}
    </blockquote>
    <p><strong>Trial ID:</strong> <code>${trialId}</code></p>
    <p><a href="${reviewUrl}">Respond in Reviewer Console</a></p>
  </div>`;

  return notifyReviewers(subject, body, htmlBody);
}
