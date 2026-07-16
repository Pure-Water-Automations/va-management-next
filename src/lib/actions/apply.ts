/**
 * Native job-application intake — accepts a submission from the public
 * Typeform-style /apply form and creates (or updates) a Candidate at stage
 * "applied". Replaces the Google Form + onFormSubmit_Application trigger.
 */
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { validateApplication, candidateFieldsFromAnswers } from "@/lib/application-questions";
import { screenAndSaveCandidate } from "@/lib/actions/screening";

export async function submitApplication(raw: Record<string, unknown>) {
  const validation = validateApplication(raw);
  if (!validation.ok) throw new Error(validation.error);
  const answers = validation.answers;
  const fields = candidateFieldsFromAnswers(answers);
  if (!fields.email) throw new Error("Please answer: email address.");

  const existing = await db.candidate.findUnique({ where: { email: fields.email }, select: { candidateId: true } });

  const data = {
    name: fields.name,
    skillsRoleTags: fields.skillsRoleTags,
    resumeUrl: fields.resumeUrl,
    country: fields.country,
    source: "native_form",
    applicationJson: answers as Prisma.InputJsonValue,
  };

  let isNew = false;
  let candidateId: string;
  if (existing) {
    // Re-application / edit — refresh the application data, keep their pipeline stage.
    const updated = await db.candidate.update({ where: { email: fields.email }, data });
    candidateId = updated.candidateId;
  } else {
    const created = await db.candidate.create({ data: { email: fields.email, currentStage: "applied", ...data } });
    candidateId = created.candidateId;
    isNew = true;
  }

  await logActivity({
    source: "recruitment_intake",
    eventType: isNew ? "application_received" : "application_updated",
    summary: `${isNew ? "New" : "Updated"} VA application: ${fields.name || fields.email}`,
  });

  if (isNew) await notifyTeamLead(fields, answers);

  // AI first-pass screening — best-effort, don't block or fail the applicant's
  // submission on it. The daily worker backfills anything that doesn't run here.
  void screenAndSaveCandidate(candidateId).catch(() => {});

  return { ok: true, candidateId, isNew };
}

async function notifyTeamLead(
  fields: ReturnType<typeof candidateFieldsFromAnswers>,
  answers: Record<string, string>,
) {
  try {
    const settings = await db.setting.findMany({
      where: { key: { in: ["system_email_from", "team_lead_email", "recruiter_email"] } },
      select: { key: true, value: true },
    });
    const map = new Map(settings.map((s) => [s.key, (s.value ?? "").trim()]));
    const from = map.get("system_email_from");
    const to = map.get("team_lead_email") || map.get("recruiter_email");
    if (!from || !to) return;
    const base = env.APP_BASE_URL || "https://dev-team.pwasecondbrain.uk";
    await sendSystemEmail({
      from,
      to,
      subject: `New VA application — ${fields.name || fields.email}`,
      body:
        `A new VA application came in through the application form.\n\n` +
        `Name: ${fields.name || "(not provided)"}\n` +
        `Email: ${fields.email}\n` +
        `Location: ${answers.address || "(not provided)"}\n` +
        `Community: ${answers.community || "(not provided)"}\n` +
        `FFWPU affiliated: ${answers.ffwpuAffiliated || "(not provided)"}\n` +
        `Referral source: ${answers.referralSource || "(not provided)"}\n` +
        `Prior VA experience: ${answers.hasVaExperience || "(not provided)"}\n` +
        `Skills: ${answers.skills || "(not provided)"}\n` +
        `Resume: ${fields.resumeUrl || "(not provided)"}\n\n` +
        `Review the pipeline: ${base}/recruitment`,
    });
  } catch {
    // best-effort — never fail the applicant's submission on a mail hiccup
  }
}
