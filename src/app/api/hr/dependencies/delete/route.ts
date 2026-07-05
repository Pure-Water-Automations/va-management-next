import { action, str } from "@/lib/api";
import { removeDependency } from "@/lib/actions/dependencies";

export const POST = action(
  async ({ user, body }) => removeDependency(user.id, user.role, str(body, "id")),
  { allowUser: (u) => u.caps.manageTasks },
);
