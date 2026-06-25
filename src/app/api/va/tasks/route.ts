import { action } from "@/lib/api";
import { createTask } from "@/lib/actions/tasks";

// A VA self-assigns a task. The assignee is FORCED to the actor's own user id
// (any client-supplied assignedToId is ignored), so this can only ever create a
// task for yourself. Managers assigning to OTHERS keep using /api/hr/tasks.
// createTask enforces the self-assignment authority; the allow gate keeps this
// route VA-scoped.
export const POST = action(
  async ({ actor, body }) =>
    createTask(actor.id, actor.role, {
      title: body.title,
      instructions: body.instructions,
      strategy: body.strategy,
      priority: body.priority,
      dueDate: body.dueDate,
      links: body.links,
      assignedToId: actor.id,
      claimable: false,
    }),
  { allow: (r) => r === "VA" || r === "SENIOR_VA" },
);
