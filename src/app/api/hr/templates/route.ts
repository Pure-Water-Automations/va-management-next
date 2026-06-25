import { action } from "@/lib/api";
import { createProjectTemplate, createTaskTemplate } from "@/lib/actions/templates";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ actor, body }) => {
    const kind = body.kind;
    if (kind === "project") {
      return createProjectTemplate(actor.id, actor.role, {
        name: body.name,
        description: body.description,
        type: body.type,
        priority: body.priority,
        tasks: body.tasks,
      });
    }
    if (kind === "task") {
      return createTaskTemplate(actor.id, actor.role, {
        name: body.name,
        title: body.title,
        instructions: body.instructions,
        strategy: body.strategy,
        priority: body.priority,
      });
    }
    throw new Error('Missing or invalid field: kind (expected "project" or "task")');
  },
  { allow: (r) => canManageTasks(r) },
);
