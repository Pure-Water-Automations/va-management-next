import { action, str } from "@/lib/api";
import { addDependency } from "@/lib/actions/dependencies";

export const POST = action(
  async ({ actor, body }) =>
    addDependency(actor.id, actor.role, str(body, "taskId"), str(body, "dependsOnTaskId")),
  { allowUser: (u) => u.caps.manageTasks },
);
