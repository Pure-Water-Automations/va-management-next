import { action, str } from "@/lib/api";
import { resolveClaim } from "@/lib/actions/tasks";

export const POST = action(
  async ({ user, body }) => resolveClaim(user.id, user.role, str(body, "taskId"), body.approve === true || body.approve === "true"),
  { allowUser: (u) => u.caps.manageTasks },
);
