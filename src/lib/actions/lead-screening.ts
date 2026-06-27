import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { screenLead } from "@/lib/services/lead-screen";

/** Run AI lead scoring on one Deal's discovery answers and save it. */
export async function scoreAndSaveLead(dealId: string) {
  const deal = await db.deal.findUnique({ where: { id: dealId } });
  if (!deal) throw new Error(`Deal not found: ${dealId}`);
  if (!deal.discoveryJson) throw new Error("This deal has no discovery submission to score.");

  const answers = deal.discoveryJson as Record<string, string>;
  const result = await screenLead(answers);

  await db.deal.update({
    where: { id: dealId },
    data: {
      leadVerdict: result.verdict,
      leadScore: result.score,
      leadSummary: result.summary,
      leadFlags: result.flags as Prisma.InputJsonValue,
      scoredAt: new Date(),
    },
  });

  await logActivity({
    source: "sales",
    eventType: "lead_screened",
    severity: result.verdict === "cold" ? "warning" : "info",
    summary: `AI scored ${deal.orgName}: ${result.verdict} (${result.score}/100)`,
  });
  return result;
}
