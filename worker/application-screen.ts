/**
 * AI application screening (backfill) — screens any native-form candidate that
 * hasn't been screened yet (e.g. if the on-submit best-effort screen failed, or
 * for applications imported before screening existed). Runs in the daily batch.
 */
import { db } from "@/lib/db";
import { screenAndSaveCandidate } from "@/lib/actions/screening";

async function main() {
  const run = await db.syncRun.create({ data: { worker: "application-screen", status: "FAILED" } });
  try {
    const pending = await db.candidate.findMany({
      where: { source: "native_form", screenedAt: null },
      select: { candidateId: true, name: true, email: true },
      take: 100,
    });

    let screened = 0;
    let failed = 0;
    for (const c of pending) {
      try {
        await screenAndSaveCandidate(c.candidateId);
        screened++;
      } catch (err) {
        failed++;
        console.error(`screen failed for ${c.name ?? c.email}: ${err instanceof Error ? err.message : err}`);
      }
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: { status: failed && !screened ? "FAILED" : "SUCCESS", finishedAt: new Date(), detailsJson: { pending: pending.length, screened, failed } },
    });
    console.log(`application-screen: ${screened} screened, ${failed} failed of ${pending.length} pending`);
  } catch (err) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] } });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`application-screen failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
