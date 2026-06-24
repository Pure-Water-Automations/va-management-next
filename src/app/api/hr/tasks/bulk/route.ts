import { action } from "@/lib/api";
import { bulkUpdateTasks } from "@/lib/actions/tasks";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ actor, body }) =>
    bulkUpdateTasks(actor.id, actor.role, (body.taskIds as string[]) ?? [], {
      status: body.status,
      priority: body.priority,
      assignedToId: body.assignedToId,
      dueDate: body.dueDate,
    }),
  { allow: (r) => canManageTasks(r) },
);
