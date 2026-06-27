/**
 * Email a reminder before each scheduled discovery call. Idempotent within a run
 * window: finds calls starting inside the next `discovery_reminder_hours` that
 * haven't been reminded yet, emails the lead + rep, and stamps the deal so the
 * reminder isn't sent twice. Run on a timer (e.g. hourly): npm run worker:discovery-reminders
 */
import { db } from "@/lib/db";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, num, str } from "@/lib/settings";

async function main() {
  const settings = await loadSettings();
  const from = str(settings, "system_email_from");
  if (!from) { console.log("discovery-reminders: no system_email_from set — skipping."); return; }
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
    const when = d.discoveryCallAt!.toUTCString();
    const to = [d.contactEmail, d.discoveryRepEmail].filter(Boolean) as string[];
    try {
      if (to.length) {
        await sendSystemEmail({
          from, to,
          subject: `Reminder: discovery call — ${d.orgName}`,
          body:
            `This is a friendly reminder of your upcoming discovery call.\n\n` +
            `  ${when}\n` +
            (d.discoveryCallVideoUrl ? `  Join: ${d.discoveryCallVideoUrl}\n` : "") +
            `\nSee you soon!`,
        });
      }
      await db.deal.update({ where: { id: d.id }, data: { discoveryReminderSentAt: new Date() } });
      console.log(`  ✓ reminded ${d.orgName}`);
    } catch (err) {
      console.warn(`  ✗ ${d.orgName}:`, err instanceof Error ? err.message : err);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
