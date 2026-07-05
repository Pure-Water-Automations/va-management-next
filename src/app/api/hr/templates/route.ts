import { action } from "@/lib/api";
import { createProjectTemplate, createTaskTemplate } from "@/lib/actions/templates";

export const POST = action(
  async ({ user, body }) => {
    const kind = body.kind;
    if (kind === "project") {
      return createProjectTemplate(user.id, user.role, {
        name: body.name,
        description: body.description,
        type: body.type,
        priority: body.priority,
        tasks: body.tasks,
      });
    }
    if (kind === "task") {
      return createTaskTemplate(user.id, user.role, {
        name: body.name,
        title: body.title,
        instructions: body.instructions,
        strategy: body.strategy,
        priority: body.priority,
      });
    }
    throw new Error('Missing or invalid field: kind (expected "project" or "task")');
  },
  { allowUser: (u) => u.caps.manageTasks },
);
