import { markContractSigned } from "@/lib/actions/recruitment";
import { action, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";

export const POST = action(
  async ({ body }) => markContractSigned(str(body, "candidateId")),
  { allow: isGateReviewer },
);
