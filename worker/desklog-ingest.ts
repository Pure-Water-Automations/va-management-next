/**
 * AUTO_desklogIngest — daily. Fetch yesterday's attendance for each active VA
 * with a desklog_user_id and append DeskLogHours + DeskLogEfficiency rows.
 * No-ops gracefully if the DeskLog token/base URL aren't configured.
 */
import { db } from "@/lib/db";
import { fetchAttendance } from "@/lib/desklog";
import { loadSettings, str } from "@/lib/settings";

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ddmmyyyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

async function main() {
  const run = await db.syncRun.create({ data: { worker: "desklog-ingest", status: "FAILED" } });
  try {
    const settings = await loadSettings();
    const baseUrl = str(settings, "desklog_base_url", "https://app.desklog.io/api/v2");
    const bearerToken = str(settings, "desklog_bearer_token", "");
    if (!bearerToken) {
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), firstErrorLine: "desklog_bearer_token not configured — skipped", detailsJson: { skipped: true } },
      });
      console.log("desklog-ingest: skipped (no token configured)");
      return;
    }

    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dateOnly = new Date(ymd(yesterday) + "T00:00:00.000Z");
    const from = ddmmyyyy(yesterday);

    const vas = await db.va.findMany({
      where: { status: { in: ["active", "training"] }, desklogUserId: { not: null } },
    });

    let ingested = 0;
    let authFailures = 0;
    for (const va of vas) {
      try {
        const r = await fetchAttendance({
          baseUrl,
          bearerToken,
          desklogUserId: va.desklogUserId!,
          fromDate: from,
          toDate: from,
        });
        await db.deskLogHours.create({
          data: {
            date: dateOnly,
            vaId: va.vaId,
            desklogUserId: va.desklogUserId,
            project: r.project,
            task: r.task,
            billable: r.billable,
            timeAtWorkHrs: r.timeAtWorkHrs,
            focusTimeHrs: r.focusTimeHrs,
            idleTimeHrs: r.idleTimeHrs,
            taskSpentHrs: r.taskSpentHrs,
            taskAssignedHrs: r.taskAssignedHrs,
            payRule: r.payRule,
          },
        });
        await db.deskLogEfficiency.create({
          data: {
            date: dateOnly,
            vaId: va.vaId,
            desklogUserId: va.desklogUserId,
            activityPct: r.activityPct,
            efficiencyPct: r.efficiencyPct,
            productiveTimeHrs: r.productiveTimeHrs,
            focusTimeHrs: r.focusTimeHrs,
            idleTimeHrs: r.idleTimeHrs,
            nonProductiveTimeHrs: r.nonProductiveTimeHrs,
          },
        });
        ingested++;
      } catch (e) {
        const msg = String(e);
        if (msg.includes("401") || msg.includes("403")) authFailures++;
        console.error(`  ${va.vaId}: ${msg.split("\n")[0]}`);
      }
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: authFailures === vas.length && vas.length > 0 ? "FAILED" : "SUCCESS",
        finishedAt: new Date(),
        detailsJson: { ingested, authFailures, vas: vas.length },
      },
    });
    console.log(`desklog-ingest: ingested ${ingested}/${vas.length} (auth failures: ${authFailures})`);
  } catch (err) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] } });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`desklog-ingest failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
