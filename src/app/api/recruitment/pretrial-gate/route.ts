import { preTrialGate } from "@/lib/actions/recruitment";
import { action, optStr, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";

// Pre-trial (onboarding-readiness) gate. Approve starts the trial; decline waitlists.
export const POST = action(
  async ({ user, body }) =>
    preTrialGate(
      str(body, "candidateId"),
      str(body, "result"),
      optStr(body, "notes"),
      user.email,
    ),
  { allow: isGateReviewer },
);
