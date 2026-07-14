import { action, str } from "@/lib/api";
import { instantiateProjectTemplate, instantiateTaskTemplate } from "@/lib/actions/templates";

export const POST = action(
  async ({ actor, body }) => {
    const id = str(body, "id");
    if (body.kind === "project")
      return instantiateProjectTemplate(actor.id, actor.role, id, { name: body.name });
    if (body.kind === "task") return instantiateTaskTemplate(actor.id, actor.role, id);
    throw new Error('Missing or invalid field: kind (expected "project" or "task")');
  },
  { allowUser: (u) => u.caps.manageTasks },
);
