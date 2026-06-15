/**
 * Application intake — polls the public job-application Google Form's response
 * sheet and upserts new applicants into the recruitment pipeline (stage
 * "applied"). Replaces the old GAS onFormSubmit_Application trigger. Notifies the
 * team lead on genuinely-new applications. No-ops gracefully if unconfigured.
 */
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { readTab } from "@/lib/google/sheets";
import { parseApplicationRows } from "@/lib/forms-intake";
import { loadSettings, str } from "@/lib/settings";
import { sendSystemEmail } from "@/lib/email";
import { logActivity } from "@/lib/activity";

async function main() {
  const run = await db.syncRun.create({ data: { worker: "application-intake-poll", status: "FAILED" } });
  try {
    const sheetId = env.APPLICATION_RESPONSES_SHEET_ID;
    if (!sheetId) {
      await db.syncRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { skipped: true, reason: "APPLICATION_RESPONSES_SHEET_ID not set" } } });
      console.log("application-intake: skipped (no response sheet configured)");
      return;
    }

    const values = await readTab(sheetId, env.APPLICATION_RESPONSES_TAB);
    const rows = parseApplicationRows(values);

    const settings = await loadSettings();
    const from = str(settings, "system_email_from", "");
    const teamLead = str(settings, "team_lead_email", "");

    let created = 0;
    for (const r of rows) {
      const email = (r.email || "").trim().toLowerCase();
      if (!email) continue;
      const existing = await db.candidate.findUnique({ where: { email }, select: { candidateId: true } });
      if (existing) continue;
      await db.candidate.create({
        data: {
          email,
          name: r.name || null,
          skillsRoleTags: r.skillsRoleTags || null,
          source: "google_form",
          currentStage: "applied",
        },
      });
      created++;
      await logActivity({ source: "recruitment_intake", eventType: "application_received", summary: `New application: ${r.name || email}` });
      if (from && teamLead) {
        await sendSystemEmail({ from, to: teamLead, subject: `New VA application — ${r.name || email}`, body: `A new VA application was submitted.\n\nName: ${r.name || "(not provided)"}\nEmail: ${email}\nSkills/Role: ${r.skillsRoleTags || "(not provided)"}\n\nReview it: ${env.APP_BASE_URL || "https://team.pwasecondbrain.uk"}/recruitment` });
      }
    }

    await db.syncRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { scanned: rows.length, created } } });
    console.log(`application-intake: ${created} new candidate(s) from ${rows.length} response(s)`);
  } catch (err) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] } });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`application-intake failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
