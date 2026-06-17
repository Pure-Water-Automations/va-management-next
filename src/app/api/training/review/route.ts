import { markSessionReviewed } from "@/lib/actions/training";
import { action, optStr, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) =>
    markSessionReviewed(
      str(body, "sessionId"),
      str(body, "reviewStatus"),
      optStr(body, "reviewNotes"),
      user.email,
    ),
  { allow: isGateReviewer },
);
