import { action } from "@/lib/api";
import { bulkUpdateTasks } from "@/lib/actions/tasks";

export const POST = action(
  async ({ user, body }) =>
    bulkUpdateTasks(user.id, user.role, (body.taskIds as string[]) ?? [], {
      status: body.status,
      priority: body.priority,
      assignedToId: body.assignedToId,
      dueDate: body.dueDate,
    }),
  { allowUser: (u) => u.caps.manageTasks },
);
