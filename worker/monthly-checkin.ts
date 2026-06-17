/**
 * AUTO_monthlyCheckIn — daily gate. On the configured send day, email the
 * monthly check-in form to all active VAs; a few days later, remind those who
 * haven't checked in. No-ops gracefully if email/form aren't configured.
 */
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, num, str } from "@/lib/settings";

const DAY = 24 * 60 * 60 * 1000;

async function main() {
  const run = await db.syncRun.create({ data: { worker: "monthly-checkin", status: "FAILED" } });
  try {
    const settings = await loadSettings();
    const enabled = str(settings, "auto_checkin_enabled", "FALSE").toUpperCase() === "TRUE";
    const from = str(settings, "system_email_from", "");
    const formUrl = str(settings, "monthly_checkin_form_url", "");
    const sendDay = num(settings, "auto_checkin_send_day", 1);
    const reminderDays = num(settings, "auto_checkin_reminder_days", 3);

    if (!enabled || !from || !formUrl) {
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { skipped: true, enabled, hasFrom: !!from, hasForm: !!formUrl } },
      });
      console.log("monthly-checkin: skipped (disabled or unconfigured)");
      return;
    }

    const today = new Date();
    const dom = today.getUTCDate();
    const vas = await db.va.findMany({ where: { status: { in: ["active", "training"] } } });
    let action = "none";
    let sent = 0;

    if (dom === sendDay) {
      for (const v of vas)
        if (v.email) {
          await sendSystemEmail({ from, to: v.email, subject: "Monthly check-in", body: `Please complete your monthly check-in: ${formUrl}` });
          sent++;
        }
      action = "sent_all";
    } else if (dom === sendDay + reminderDays) {
      const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      for (const v of vas)
        if (v.email && (!v.lastCheckinDate || v.lastCheckinDate < monthStart)) {
          await sendSystemEmail({ from, to: v.email, subject: "Reminder: monthly check-in", body: `A quick reminder to complete your monthly check-in: ${formUrl}` });
          sent++;
        }
      action = "reminder";
    }

    if (sent > 0) await logActivity({ source: "monthly_checkin", eventType: action, summary: `Check-in ${action}: ${sent} email(s)` });
    await db.syncRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { action, sent } } });
    console.log(`monthly-checkin: ${action} (${sent} emails)`);
  } catch (err) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] } });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`monthly-checkin failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
