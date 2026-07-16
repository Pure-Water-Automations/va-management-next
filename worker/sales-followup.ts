/**
 * AUTO_salesFollowUp — daily nudges for the client sales pipeline:
 *  - deals whose nextFollowUpAt is due (and not Won/Lost) → remind the account owner;
 *  - agreements sent but unsigned and past deadline → flag for the team;
 *  - onboarding records stalled with no intake received → remind the owner.
 * Best-effort; no-ops gracefully when email isn't configured.
 */
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings } from "@/lib/settings";
import { systemEmailFrom, teamRecipients, companyName } from "@/lib/sales/util";

async function main() {
  const run = await db.syncRun.create({ data: { worker: "sales-followup", status: "FAILED" } });
  try {
    const settings = await loadSettings();
    const from = systemEmailFrom(settings);
    const team = teamRecipients(settings);
    const company = companyName(settings);
    const now = new Date();
    let sent = 0;

    // 1) Deals with a follow-up due today or earlier.
    const dueDeals = await db.deal.findMany({
      where: { nextFollowUpAt: { lte: now }, stage: { notIn: ["won", "lost"] } },
    });
    for (const d of dueDeals) {
      const to = d.accountOwnerEmail || team[0];
      if (!to) continue;
      await sendSystemEmail({
        from,
        to,
        subject: `Follow-up due: ${d.orgName}`,
        body: `A follow-up is due for ${d.orgName} (stage: ${d.stage}). Update the deal or set the next step.\n\n— The ${company} team`,
      }).catch(() => {});
      await db.deal.update({ where: { id: d.id }, data: { nextFollowUpAt: null } });
      sent++;
    }

    // 2) Agreements sent but unsigned and past deadline.
    const staleAgreements = await db.clientAgreement.findMany({
      where: { status: "sent", signedAt: null, deadline: { lt: now } },
      include: { deal: true },
    });
    for (const a of staleAgreements) {
      if (!team.length) break;
      await sendSystemEmail({
        from,
        to: team,
        subject: `Agreement unsigned past deadline: ${a.deal.orgName}`,
        body: `${a.deal.orgName}'s service agreement was sent but remains unsigned past its deadline. Consider a warm nudge or a fresh signing link.\n\n— The ${company} team`,
      }).catch(() => {});
      sent++;
    }

    // 3) Onboarding stalled — created over 3 days ago, no intake received.
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    const stalled = await db.clientOnboarding.findMany({
      where: { intakeReceived: false, status: { not: "completed" }, createdAt: { lt: threeDaysAgo } },
      include: { clientOrganization: true },
    });
    for (const o of stalled) {
      const to = o.owner || team[0];
      if (!to) continue;
      await sendSystemEmail({
        from,
        to,
        subject: `Onboarding stalled: ${o.clientOrganization.name}`,
        body: `${o.clientOrganization.name} has not submitted their intake form yet. Resend the intake link or follow up.\n\n— The ${company} team`,
      }).catch(() => {});
      sent++;
    }

    if (sent > 0) await logActivity({ source: "sales", eventType: "sales_followup", summary: `Sales follow-up: ${sent} reminder(s)` });
    await db.syncRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { sent, dueDeals: dueDeals.length, staleAgreements: staleAgreements.length, stalled: stalled.length } } });
    console.log(`sales-followup: ${sent} reminders`);
  } catch (err) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] } });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`sales-followup failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
