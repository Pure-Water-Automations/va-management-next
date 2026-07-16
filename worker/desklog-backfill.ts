/**
 * One-off / recovery backfill for DeskLog hours over a DATE RANGE.
 *
 * The daily `desklog-ingest` worker only pulls YESTERDAY, one day per run — so if
 * the timer is ever dormant for a stretch, those days are simply never fetched
 * and VA utilization reads ~0% (the window is empty, not the work). This fills a
 * gap. Same idempotent per-VA+day delete+create as the daily worker, so re-running
 * over already-present days is safe.
 *
 *   FROM=2026-06-26 TO=2026-07-14 npm run worker:desklog-backfill
 *   # or positional: npm run worker:desklog-backfill 2026-06-26 2026-07-14
 */
import { db } from "@/lib/db";
import { fetchAttendance } from "@/lib/desklog";
import { loadSettings, str } from "@/lib/settings";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// DeskLog rate-limits bursts (429). Fetch with a small gap + backoff retry so a
// full-range backfill (many days × many VAs) doesn't get throttled out.
async function fetchWithRetry(opts: Parameters<typeof fetchAttendance>[0]) {
  let delay = 1500;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await fetchAttendance(opts);
    } catch (e) {
      if (String(e).includes("429") && attempt < 5) {
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw e;
    }
  }
  throw new Error("unreachable");
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function ddmmyyyy(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}-${p(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`;
}

async function main() {
  const from = process.env.FROM ?? process.argv[2];
  const to = process.env.TO ?? process.argv[3];
  if (!from || !to || !/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    console.error("usage: FROM=YYYY-MM-DD TO=YYYY-MM-DD (inclusive)");
    process.exit(1);
  }

  const settings = await loadSettings();
  const baseUrl = str(settings, "desklog_base_url", "https://app.desklog.io/api/v2");
  const bearerToken = str(settings, "desklog_bearer_token", "");
  if (!bearerToken) {
    console.error("desklog-backfill: no desklog_bearer_token configured — aborting.");
    process.exit(1);
  }

  const vas = await db.va.findMany({
    where: { status: { in: ["active", "training"] }, desklogUserId: { not: null } },
  });

  const start = new Date(from + "T00:00:00.000Z");
  const end = new Date(to + "T00:00:00.000Z");
  let days = 0;
  let ingested = 0;
  let authFailures = 0;

  for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
    const dateOnly = new Date(ymd(d) + "T00:00:00.000Z");
    const dateStr = ddmmyyyy(d);
    days++;
    for (const va of vas) {
      try {
        const r = await fetchWithRetry({
          baseUrl,
          bearerToken,
          desklogUserId: va.desklogUserId!,
          fromDate: dateStr,
          toDate: dateStr,
        });
        await sleep(250); // steady gap between calls to stay under the rate limit
        await db.$transaction([
          db.deskLogHours.deleteMany({ where: { vaId: va.vaId, date: dateOnly } }),
          db.deskLogEfficiency.deleteMany({ where: { vaId: va.vaId, date: dateOnly } }),
          db.deskLogHours.create({
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
          }),
          db.deskLogEfficiency.create({
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
          }),
        ]);
        ingested++;
      } catch (e) {
        const msg = String(e);
        if (msg.includes("401") || msg.includes("403")) authFailures++;
        console.error(`  ${dateStr} ${va.vaId}: ${msg.split("\n")[0]}`);
      }
    }
    console.log(`desklog-backfill: ${ymd(d)} done`);
  }

  console.log(`desklog-backfill: ${days} day(s) × ${vas.length} VA(s) → ${ingested} rows (auth failures: ${authFailures}).`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`desklog-backfill failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
