import { action, str } from "@/lib/api";
import { setTrainingTaskActive } from "@/lib/actions/training-tasks";
import { canDecideHire } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) => setTrainingTaskActive(str(body, "id"), body.active !== false, user.email),
  { allow: canDecideHire },
);
