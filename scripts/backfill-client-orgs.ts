/**
 * Diagnostic script: check which Projects have clientOrganizationId set vs. which don't.
 * Read-only and idempotent — safe to run multiple times.
 *
 * Usage:
 *   npx tsx scripts/backfill-client-orgs.ts
 */

import { db } from "../src/lib/db";

async function main() {
  console.log("=== Client Organization Backfill Diagnostic ===\n");

  // Projects WITH a client org linked
  const linked = await db.project.findMany({
    where: { clientOrganizationId: { not: null } },
    select: { id: true, name: true, clientOrganizationId: true },
  });

  // Projects WITHOUT a client org linked
  const unlinked = await db.project.findMany({
    where: { clientOrganizationId: null },
    select: { id: true, name: true, clientOrganizationId: true },
  });

  console.log(`Projects linked to a ClientOrganization: ${linked.length}`);
  if (linked.length > 0) {
    for (const p of linked) {
      console.log(`  [LINKED]   ${p.id} — "${p.name}" → org: ${p.clientOrganizationId}`);
    }
  }

  console.log(`\nProjects NOT linked to a ClientOrganization: ${unlinked.length}`);
  if (unlinked.length > 0) {
    for (const p of unlinked) {
      console.log(`  [UNLINKED] ${p.id} — "${p.name}"`);
    }
  }

  console.log(`\nTotal projects: ${linked.length + unlinked.length}`);
  console.log("\nDone. No changes were made (read-only diagnostic).");
}

main()
  .catch((err) => {
    console.error("Error:", err);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
