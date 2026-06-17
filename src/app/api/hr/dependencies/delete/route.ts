import { action, str } from "@/lib/api";
import { removeDependency } from "@/lib/actions/dependencies";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) => removeDependency(user.id, user.role, str(body, "id")),
  { allow: (r) => canManageTasks(r) },
);
