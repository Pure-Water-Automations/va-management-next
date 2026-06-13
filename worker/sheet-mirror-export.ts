/**
 * Sheet mirror export — Postgres → Google Sheet (read-only mirror for humans).
 *
 * The inverse of the Event Planner Console's read-only import. Postgres is the
 * source of truth; this writes each table to its own tab in the dedicated mirror
 * spreadsheet (env.MIRROR_SHEET_ID), so Justin keeps an easy spreadsheet view of
 * the live data. NEVER writes back to the original VA workbook.
 */
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { replaceTab } from "@/lib/google/sheets";

type Cell = string | number | boolean | null;

function serialize(value: unknown): Cell {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/** Turn an array of row objects into a header row + value matrix (stable columns). */
function toMatrix(rows: Record<string, unknown>[]): Cell[][] {
  if (rows.length === 0) return [["(no rows)"]];
  const headers = Object.keys(rows[0]);
  const out: Cell[][] = [headers];
  for (const r of rows) out.push(headers.map((h) => serialize(r[h])));
  return out;
}

// tab title -> loader. Order is cosmetic (tab order in the sheet).
const TABLES: { tab: string; load: () => Promise<Record<string, unknown>[]> }[] = [
  { tab: "Va", load: () => db.va.findMany({ orderBy: { vaId: "asc" } }) },
  { tab: "CompensationRole", load: () => db.compensationRole.findMany({ orderBy: { roleId: "asc" } }) },
  { tab: "PayrollPeriod", load: () => db.payrollPeriod.findMany({ orderBy: { periodStart: "desc" } }) },
  { tab: "PayrollCalculation", load: () => db.payrollCalculation.findMany({ orderBy: { periodStart: "desc" } }) },
  { tab: "TierReview", load: () => db.tierReview.findMany({ orderBy: { timestamp: "desc" } }) },
  { tab: "CapacityFlagEvent", load: () => db.capacityFlagEvent.findMany({ orderBy: { timestamp: "desc" } }) },
  { tab: "Candidate", load: () => db.candidate.findMany({ orderBy: { lastUpdated: "desc" } }) },
  { tab: "TrainingSession", load: () => db.trainingSession.findMany({ orderBy: { createdAt: "desc" } }) },
  { tab: "Onboarding", load: () => db.onboarding.findMany() },
  { tab: "DeskLogHours", load: () => db.deskLogHours.findMany({ orderBy: [{ date: "desc" }, { vaId: "asc" }] }) },
  { tab: "DeskLogEfficiency", load: () => db.deskLogEfficiency.findMany({ orderBy: [{ date: "desc" }, { vaId: "asc" }] }) },
  { tab: "Setting", load: () => db.setting.findMany({ orderBy: { key: "asc" } }) },
  { tab: "Policy", load: () => db.policy.findMany({ orderBy: { key: "asc" } }) },
  { tab: "ActivityLog", load: () => db.activityLog.findMany({ orderBy: { timestamp: "desc" }, take: 1000 }) },
];

async function main() {
  if (!env.MIRROR_SHEET_ID) {
    console.error("MIRROR_SHEET_ID is not set — nothing to export to.");
    process.exit(0);
  }
  const run = await db.syncRun.create({ data: { worker: "sheet-mirror-export", status: "FAILED" } });

  const summary: Record<string, number> = {};
  let firstError: string | null = null;
  for (const t of TABLES) {
    try {
      const rows = (await t.load()) as Record<string, unknown>[];
      await replaceTab(env.MIRROR_SHEET_ID, t.tab, toMatrix(rows));
      summary[t.tab] = rows.length;
      console.log(`${t.tab}: ${rows.length}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!firstError) firstError = `${t.tab}: ${msg.split("\n")[0]}`;
      console.error(`${t.tab} FAILED: ${msg.split("\n")[0]}`);
    }
  }

  await db.syncRun.update({
    where: { id: run.id },
    data: {
      status: firstError ? "PARTIAL" : "SUCCESS",
      finishedAt: new Date(),
      firstErrorLine: firstError,
      detailsJson: summary,
    },
  });
  console.log("\nMirror export:", firstError ? "PARTIAL" : "SUCCESS");
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`Mirror export failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
