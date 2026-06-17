import { action } from "@/lib/api";
import { seedTrainingModule } from "@/lib/actions/training-tasks";
import { canDecideHire } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) => seedTrainingModule(user.email, { reset: body.reset === true }),
  { allow: canDecideHire },
);
