import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { screenApplication } from "@/lib/services/application-screen";

/** Run the AI first-pass screen on one candidate's application and save it. */
export async function screenAndSaveCandidate(candidateId: string) {
  const c = await db.candidate.findUnique({ where: { candidateId } });
  if (!c) throw new Error(`Candidate not found: ${candidateId}`);
  if (!c.applicationJson) throw new Error("This candidate has no native application to screen.");

  const answers = c.applicationJson as Record<string, string>;
  const result = await screenApplication(answers);

  await db.candidate.update({
    where: { candidateId },
    data: {
      screenVerdict: result.verdict,
      screenScore: result.score,
      screenSummary: result.summary,
      screenFlags: result.flags as Prisma.InputJsonValue,
      screenedAt: new Date(),
    },
  });

  await logActivity({
    source: "recruitment",
    eventType: "application_screened",
    severity: result.verdict === "spam" ? "warning" : "info",
    summary: `AI screened ${c.name ?? c.email}: ${result.verdict} (${result.score}/100)`,
  });
  return result;
}
