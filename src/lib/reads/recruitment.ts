import { db } from "@/lib/db";
import type { CandidateStage } from "@prisma/client";

export const REC_STAGES: CandidateStage[] = [
  "applied",
  "reviewed",
  "interview_scheduled",
  "interviewed",
  "decision",
  "tenhr_invited",
  "tenhr_in_progress",
  "tenhr_pass",
  "tenhr_fail",
  "contract_sent",
  "signed",
  "onboarding",
  "closed",
];

export type RecruitmentPipeline = Awaited<ReturnType<typeof getPipeline>>;

export async function getPipeline(includeClosed = false) {
  const candidates = await db.candidate.findMany({ orderBy: { lastUpdated: "desc" } });
  const counts: Record<string, number> = {};
  for (const s of REC_STAGES) counts[s] = 0;
  for (const c of candidates) if (counts[c.currentStage] !== undefined) counts[c.currentStage]++;
  const visible = includeClosed ? candidates : candidates.filter((c) => c.currentStage !== "closed");
  return { stages: REC_STAGES, counts, candidates: visible };
}

export async function getTrainingLog() {
  const candidates = await db.candidate.findMany({
    where: {
      currentStage: { in: ["tenhr_invited", "tenhr_in_progress", "tenhr_pass", "tenhr_fail"] },
    },
    orderBy: { trainingTotalMinutes: "desc" },
  });
  return candidates;
}
