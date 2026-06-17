import { markContractSent } from "@/lib/actions/recruitment";
import { action, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";

export const POST = action(
  async ({ body }) => markContractSent(str(body, "candidateId")),
  { allow: isGateReviewer },
);
