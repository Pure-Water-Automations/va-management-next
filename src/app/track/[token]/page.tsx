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
    select: { trial: { select: { programVersion: { select: { versionNumber: true } } } } },
  });

  const versionNumber = candidate?.trial?.programVersion.versionNumber;
  if (!candidate?.trial || versionNumber === 1) {
    return <TrackClient token={token} />;
  }

  return <MissionControl token={token} />;
}
