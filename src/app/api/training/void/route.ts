import { voidSession } from "@/lib/actions/training";
import { action, optStr, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) =>
    voidSession(str(body, "sessionId"), optStr(body, "reason"), user.email),
  { allow: isGateReviewer },
);
