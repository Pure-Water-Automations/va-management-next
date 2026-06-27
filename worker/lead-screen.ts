/**
 * Backfill AI scoring for native-form discovery leads that were not scored inline
 * (e.g. the OpenAI key was missing at submit time). Mirrors worker/application-screen.ts.
 * Run via: npm run worker:lead-screen
 */
import { db } from "@/lib/db";
import { scoreAndSaveLead } from "@/lib/actions/lead-screening";

async function main() {
  // Note: filter on source + scoredAt only (avoid Prisma's Json-null filter
  // quirk). scoreAndSaveLead throws for a lead with no discoveryJson; we catch it.
  const leads = await db.deal.findMany({
    where: { source: "native_form", scoredAt: null },
    select: { id: true, orgName: true },
    take: 50,
  });
  console.log(`lead-screen: ${leads.length} unscored lead(s).`);
  for (const lead of leads) {
    try {
      const r = await scoreAndSaveLead(lead.id);
      console.log(`  ✓ ${lead.orgName}: ${r.verdict} (${r.score})`);
    } catch (err) {
      console.warn(`  ✗ ${lead.orgName}:`, err instanceof Error ? err.message : err);
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
