// POST /api/trials/review/accommodation — reviewer toggles the fairness
// accommodation on a trial (pauses reminders + excludes latency scoring, doc
// 13 §1.3). Logs ACCOMMODATION_TOGGLED. Same auth as the gate (recruiter/admin).

import { action, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { TRIAL_EVENTS } from "@/lib/trial/events";

const DAY_MS = 24 * 60 * 60 * 1000;

export const POST = action(
  async ({ user, body }) => {
    const candidateId = str(body, "candidateId");
    const trial = await db.candidateTrial.findUnique({
      where: { candidateId },
      select: { id: true, startDate: true, accommodationsActive: true },
    });
    if (!trial) throw new Error("No skills trial found for this candidate.");

    const next = !trial.accommodationsActive;
    const now = new Date();
    const day = Math.max(
      1,
      Math.floor((now.getTime() - trial.startDate.getTime()) / DAY_MS) + 1,
    );

    await db.$transaction(async (tx) => {
      await tx.candidateTrial.update({
        where: { id: trial.id },
        data: { accommodationsActive: next },
      });
      await tx.trialEvent.create({
        data: {
          trialId: trial.id,
          day,
          actor: "Human",
          type: TRIAL_EVENTS.ACCOMMODATION_TOGGLED,
          label: `Accommodations ${next ? "activated" : "cleared"} — ${user.name ?? user.email}`,
          dataJson: { active: next },
        },
      });
    });

    await logActivity({
      source: "recruitment",
      eventType: "trial_accommodation_toggled",
      summary: `Accommodations ${next ? "activated" : "cleared"} for trial ${candidateId} by ${user.email}`,
    });

    return { accommodationsActive: next };
  },
  { allow: isGateReviewer },
);
