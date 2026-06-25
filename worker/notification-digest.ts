/**
 * notification-digest — daily. For each active/training VA whose task-notification
 * preference (notifyChannel) is "digest", email a plain-text summary of their open
 * tasks (with a "new since yesterday" callout). No-ops gracefully when email isn't
 * configured or a VA has no open tasks. Mirrors the monthly-checkin SyncRun pattern.
 *
 * Digest VAs get NO immediate per-task pings (channelDecision returns no channel for
 * "digest"); this daily summary is their channel. Schedule it once a day (e.g. cron
 * `npm run worker:digest`), like the other workers.
 */
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, str } from "@/lib/settings";

const DAY = 24 * 60 * 60 * 1000;
const BASE_URL = "https://team.pwasecondbrain.uk";

function dueLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function main() {
  const run = await db.syncRun.create({ data: { worker: "notification-digest", status: "FAILED" } });
  try {
    const settings = await loadSettings();
    const enabled = str(settings, "notification_digest_enabled", "FALSE").toUpperCase() === "TRUE";
    const from = str(settings, "system_email_from", "");
    const baseUrl = str(settings, "app_base_url", BASE_URL) || BASE_URL;
    if (!enabled || !from) {
      const reason = !enabled ? "notification_digest_enabled not TRUE" : "no_system_email_from";
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { skipped: true, reason } },
      });
      console.log(`notification-digest: skipped (${reason})`);
      return;
    }

    const now = new Date();
    const since = new Date(now.getTime() - DAY);

    const vas = await db.va.findMany({
      where: { status: { in: ["active", "training"] }, notifyChannel: "digest" },
      select: { vaId: true, name: true, email: true },
    });

    let sent = 0;
    for (const va of vas) {
      if (!va.email) continue;
      const user = await db.user.findUnique({ where: { email: va.email }, select: { id: true } });
      if (!user) continue;

      const tasks = await db.task.findMany({
        where: { assignedToId: user.id, status: { not: "Done" } },
        orderBy: [{ dueDate: "asc" }],
        select: { title: true, status: true, dueDate: true, createdAt: true },
      });
      if (tasks.length === 0) continue;

      const lines = tasks.map((t) => {
        const overdue = !!t.dueDate && t.dueDate < now;
        const isNew = t.createdAt > since;
        const due = t.dueDate ? `, due ${dueLabel(t.dueDate)}` : "";
        return `• ${t.title} — ${t.status}${due}${overdue ? " (OVERDUE)" : ""}${isNew ? "  [new]" : ""}`;
      });
      const newCount = tasks.filter((t) => t.createdAt > since).length;

      const body = [
        `Hi ${va.name ?? "there"},`,
        ``,
        `Here's your daily task digest — ${tasks.length} open task${tasks.length === 1 ? "" : "s"}.`,
        newCount > 0 ? `New since yesterday: ${newCount}` : null,
        ``,
        ...lines,
        ``,
        `View all: ${baseUrl}/va/tasks`,
      ]
        .filter((l): l is string => l !== null)
        .join("\n");

      await sendSystemEmail({ from, to: va.email, subject: "Your tasks — daily digest", body });
      sent++;
    }

    if (sent > 0) {
      await logActivity({ source: "notification_digest", eventType: "digest_sent", summary: `Daily task digest sent: ${sent} email(s)` });
    }
    await db.syncRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { sent } } });
    console.log(`notification-digest: ${sent} email(s)`);
  } catch (err) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] } });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`notification-digest failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
