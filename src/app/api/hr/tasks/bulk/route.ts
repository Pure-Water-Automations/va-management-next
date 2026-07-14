import { action } from "@/lib/api";
import { bulkUpdateTasks } from "@/lib/actions/tasks";

export const POST = action(
  async ({ actor, body }) =>
    bulkUpdateTasks(actor.id, actor.role, (body.taskIds as string[]) ?? [], {
      status: body.status,
      priority: body.priority,
      assignedToId: body.assignedToId,
      dueDate: body.dueDate,
    }),
  { allowUser: (u) => u.caps.manageTasks },
);
