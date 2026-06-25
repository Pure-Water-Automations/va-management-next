import { action, str } from "@/lib/api";
import { reassignTask } from "@/lib/actions/tasks";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ actor, body }) => reassignTask(actor.id, actor.role, str(body, "taskId"), str(body, "assigneeId")),
  { allow: canManageTasks },
);
