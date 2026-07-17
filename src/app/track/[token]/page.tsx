import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { TrackClient } from "./TrackClient";
import { MissionControl } from "./mission-control/MissionControl";

export const dynamic = "force-dynamic";
export const metadata = { title: "PWA — Skills Trial" };

// Version branch: when the Skills Trial V2 flag is OFF, every token renders the
// legacy 10-hour checklist (TrackClient) exactly as before. When ON, a candidate
// whose trial runs the V2 program (versionNumber !== 1) gets the simulated
// work-week Mission Control app; V1 (or no trial) candidates keep TrackClient.
export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  if (!env.SKILLS_TRIAL_V2) {
    return <TrackClient token={token} />;
  }

  const candidate = await db.candidate.findUnique({
    where: { trainingAccessToken: token },
    select: {
      currentStage: true,
      trial: { select: { programVersion: { select: { versionNumber: true } } } },
    },
  });

  // No trial row yet is the NORMAL state for a fresh V2 invite — the trial is
  // created lazily by Mission Control's first GET /api/trials/steps. Only an
  // explicit V1 trial (or a candidate outside the trial stage) stays on the
  // legacy checklist.
  const versionNumber = candidate?.trial?.programVersion.versionNumber;
  const isActiveTrialCandidate = candidate?.currentStage === "tenhr_in_progress";
  if (versionNumber === 1 || (!candidate?.trial && !isActiveTrialCandidate)) {
    return <TrackClient token={token} />;
  }

  return <MissionControl token={token} />;
}
