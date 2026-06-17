import { gateReview } from "@/lib/actions/recruitment";
import { action, optStr, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) =>
    gateReview(
      str(body, "candidateId"),
      str(body, "gateResult"),
      optStr(body, "reviewNotes"),
      user.email,
    ),
  { allow: isGateReviewer },
);
