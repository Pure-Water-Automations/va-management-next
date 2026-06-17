import { action } from "@/lib/api";
import { createTask } from "@/lib/actions/tasks";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) =>
    createTask(user.id, user.role, {
      title: body.title,
      instructions: body.instructions,
      strategy: body.strategy,
      priority: body.priority,
      client: body.client,
      projectId: body.projectId,
      assignedToId: body.assignedToId,
      dueDate: body.dueDate,
      links: body.links,
      relatedSops: body.relatedSops,
      relatedTrainings: body.relatedTrainings,
      suggestedTools: body.suggestedTools,
    }),
  { allow: (r) => canManageTasks(r) },
);
