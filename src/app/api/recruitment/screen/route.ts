import { action, str } from "@/lib/api";
import { screenAndSaveCandidate } from "@/lib/actions/screening";
import { isRecruiter } from "@/lib/auth/roles";

export const POST = action(
  async ({ body }) => {
    return screenAndSaveCandidate(str(body, "candidateId"));
  },
  { allow: isRecruiter },
);
