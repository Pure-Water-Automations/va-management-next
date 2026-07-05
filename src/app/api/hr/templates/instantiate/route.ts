import { action, str } from "@/lib/api";
import { instantiateProjectTemplate, instantiateTaskTemplate } from "@/lib/actions/templates";

export const POST = action(
  async ({ user, body }) => {
    const id = str(body, "id");
    if (body.kind === "project")
      return instantiateProjectTemplate(user.id, user.role, id, { name: body.name });
    if (body.kind === "task") return instantiateTaskTemplate(user.id, user.role, id);
    throw new Error('Missing or invalid field: kind (expected "project" or "task")');
  },
  { allowUser: (u) => u.caps.manageTasks },
);
