/**
 * notion-sync — poll every active Notion connection: pull status changes from
 * Notion into the console and import new Notion pages, plus push any console
 * status changes that a synchronous push missed. No-ops gracefully when no client
 * has connected Notion. Records one SyncRun.
 */
import { db } from "@/lib/db";
import { syncConnection, type SyncCounts } from "@/lib/notion-engine";

async function main() {
  const run = await db.syncRun.create({ data: { worker: "notion-sync", status: "FAILED" } });
  try {
    const connections = await db.notionConnection.findMany({ where: { active: true } });
    if (connections.length === 0) {
      await db.syncRun.update({
        where: { id: run.id },
        data: { status: "SUCCESS", finishedAt: new Date(), firstErrorLine: "no active connections — skipped", detailsJson: { skipped: true } },
      });
      console.log("notion-sync: skipped (no active connections)");
      return;
    }

    const totals: SyncCounts = { imported: 0, updated: 0, pushed: 0, skipped: 0, errors: 0 };
    let failed = 0;
    for (const conn of connections) {
      try {
        const c = await syncConnection(conn);
        totals.imported += c.imported;
        totals.updated += c.updated;
        totals.pushed += c.pushed;
        totals.skipped += c.skipped;
        totals.errors += c.errors;
      } catch (e) {
        failed++;
        console.error(`notion-sync: connection ${conn.clientOrganizationId} failed: ${String(e).split("\n")[0]}`);
      }
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: failed === connections.length ? "FAILED" : failed > 0 || totals.errors > 0 ? "PARTIAL" : "SUCCESS",
        finishedAt: new Date(),
        detailsJson: { connections: connections.length, failed, ...totals },
      },
    });
    console.log(
      `notion-sync: ${connections.length} conn(s) · imported ${totals.imported} · updated ${totals.updated} · pushed ${totals.pushed} · skipped ${totals.skipped} · errors ${totals.errors}`,
    );
  } catch (err) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] } });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`notion-sync failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
