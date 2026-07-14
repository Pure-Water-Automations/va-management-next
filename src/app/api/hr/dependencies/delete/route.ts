import { action, str } from "@/lib/api";
import { removeDependency } from "@/lib/actions/dependencies";

export const POST = action(
  async ({ actor, body }) => removeDependency(actor.id, actor.role, str(body, "id")),
  { allowUser: (u) => u.caps.manageTasks },
);
