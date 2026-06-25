/**
 * Nudge worker — emails the person responsible for each console domain when they
 * have items waiting (tier reviews, candidates to decide, applications to review,
 * a payroll period to close, …). Uses the same pending-items engine as Purii's
 * notification badge, so the email and the in-app badge always agree.
 */
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { loadSettings, str } from "@/lib/settings";
import { sendSystemEmail } from "@/lib/email";
import { itemsForDomain, nudgeBody, type Domain } from "@/lib/notifications";

const baseUrl = env.APP_BASE_URL || "https://dev-team.pwasecondbrain.uk";

async function main() {
  const run = await db.syncRun.create({ data: { worker: "nudge", status: "FAILED" } });
  try {
    const settings = await loadSettings();
    const enabled = str(settings, "nudge_enabled", "FALSE").toUpperCase() === "TRUE";
    if (!enabled) {
      await db.syncRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { skipped: true, reason: "nudge_enabled not TRUE" } } });
      console.log("nudge: disabled (nudge_enabled is off) — skipped");
      return;
    }
    const from = str(settings, "system_email_from", "");

    // domain → the Setting key holding the responsible person's email
    const targets: { domain: Domain; emailKey: string }[] = [
      { domain: "HR", emailKey: "hr_manager_email" },
      { domain: "RECRUITMENT", emailKey: "recruiter_email" },
      { domain: "PAYROLL", emailKey: "bookkeeper_email" },
    ];

    let sent = 0;
    const summary: Record<string, number> = {};
    for (const t of targets) {
      const to = str(settings, t.emailKey, "");
      const items = await itemsForDomain(t.domain);
      const total = items.reduce((s, i) => s + i.count, 0);
      summary[t.domain] = total;
      if (!from || !to || items.length === 0) continue;
      await sendSystemEmail({
        from,
        to,
        subject: `${total} ${total === 1 ? "item" : "items"} waiting in the VA console`,
        body: nudgeBody(undefined, items, baseUrl),
      });
      sent++;
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { sent, ...summary, configuredFrom: !!from } },
    });
    console.log(`nudge: sent ${sent} email(s) ·`, summary);
  } catch (err) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] } });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`nudge failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
