import { action, str } from "@/lib/api";
import { claimTask } from "@/lib/actions/tasks";

// Any active signed-in VA may request to claim an open task (a manager then approves).
export const POST = action(async ({ user, body }) => claimTask(user.id, str(body, "taskId")));
