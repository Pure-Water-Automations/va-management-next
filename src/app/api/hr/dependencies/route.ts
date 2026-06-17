import { action, str } from "@/lib/api";
import { addDependency } from "@/lib/actions/dependencies";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) =>
    addDependency(user.id, user.role, str(body, "taskId"), str(body, "dependsOnTaskId")),
  { allow: (r) => canManageTasks(r) },
);
