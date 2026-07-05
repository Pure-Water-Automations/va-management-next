import { action, str } from "@/lib/api";
import { reassignTask } from "@/lib/actions/tasks";

export const POST = action(
  async ({ user, body }) => reassignTask(user.id, user.role, str(body, "taskId"), str(body, "assigneeId")),
  { allowUser: (u) => u.caps.manageTasks },
);
