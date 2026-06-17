import { markComplete } from "@/lib/actions/onboarding";
import { action, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";

export const POST = action(
  async ({ body }) => markComplete(str(body, "vaId")),
  { allow: isGateReviewer },
);
