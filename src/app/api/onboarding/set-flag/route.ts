import { setFlag } from "@/lib/actions/onboarding";
import { action, optStr, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";

export const POST = action(
  async ({ body }) =>
    setFlag(str(body, "vaId"), str(body, "field"), body.value, optStr(body, "note")),
  { allow: isGateReviewer },
);
