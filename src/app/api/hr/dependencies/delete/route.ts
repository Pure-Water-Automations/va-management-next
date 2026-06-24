import { action, str } from "@/lib/api";
import { removeDependency } from "@/lib/actions/dependencies";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ actor, body }) => removeDependency(actor.id, actor.role, str(body, "id")),
  { allow: (r) => canManageTasks(r) },
);
