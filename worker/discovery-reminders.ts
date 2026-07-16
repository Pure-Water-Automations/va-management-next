/**
 * Email a reminder before each scheduled discovery call. Idempotent within a run
 * window: finds calls starting inside the next `discovery_reminder_hours` that
 * haven't been reminded yet, emails the lead + rep, and stamps the deal so the
 * reminder isn't sent twice. Run on a timer (e.g. hourly): npm run worker:discovery-reminders
 */
import { db } from "@/lib/db";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, num } from "@/lib/settings";
import { systemEmailFrom, companyName } from "@/lib/sales/util";

async function main() {
  const settings = await loadSettings();
  // Resolve the From via the shared helper so an unset system_email_from falls
  // back (hr_manager → founder) instead of silently dropping reminders.
  const from = systemEmailFrom(settings);
  const company = companyName(settings);
  const hours = num(settings, "discovery_reminder_hours", 24);
  const now = new Date();
  const until = new Date(now.getTime() + hours * 3_600_000);

  const due = await db.deal.findMany({
    where: {
      discoveryCallStatus: "scheduled",
      discoveryCallAt: { gte: now, lte: until },
      discoveryReminderSentAt: null,
    },
    select: { id: true, orgName: true, contactName: true, contactEmail: true, discoveryRepEmail: true, discoveryCallAt: true, discoveryCallVideoUrl: true },
  });

  console.log(`discovery-reminders: ${due.length} call(s) due within ${hours}h.`);
  for (const d of due) {
    // Claim the row atomically first so two overlapping worker runs can't both
    // send (only one updateMany flips it from null).
    const claim = await db.deal.updateMany({
      where: { id: d.id, discoveryReminderSentAt: null, discoveryCallStatus: "scheduled" },
      data: { discoveryReminderSentAt: new Date() },
    });
    if (claim.count === 0) continue; // already claimed / cancelled
    const when = d.discoveryCallAt!.toUTCString();
    const to = [d.contactEmail, d.discoveryRepEmail].filter(Boolean) as string[];
    try {
      if (to.length) {
        await sendSystemEmail({
          from, to,
          subject: `Reminder: your discovery call with ${company} — ${d.orgName}`,
          body:
            `Hi from the ${company} team — this is a friendly reminder of your upcoming discovery call.\n\n` +
            `  ${when}\n` +
            (d.discoveryCallVideoUrl ? `  Join: ${d.discoveryCallVideoUrl}\n` : "") +
            `\nWe're looking forward to it. If you need to reschedule, just reply to this email.\n\n` +
            `With you in the mission,\nThe ${company} team\nhttps://purewaterautomations.com`,
        });
      }
      console.log(`  ✓ reminded ${d.orgName}`);
    } catch (err) {
      console.warn(`  ✗ ${d.orgName}:`, err instanceof Error ? err.message : err);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
