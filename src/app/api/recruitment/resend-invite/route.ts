import { resendSkillsTrialInvite } from "@/lib/actions/recruitment";
import { action, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";

// Re-send the skills-trial (10-hour) invite email to an in-progress candidate
// whose original invite never arrived.
export const POST = action(
  async ({ user, body }) => resendSkillsTrialInvite(str(body, "candidateId"), user.email),
  { allow: isGateReviewer },
);
