import { action, str } from "@/lib/api";
import { deleteProjectTemplate, deleteTaskTemplate } from "@/lib/actions/templates";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ actor, body }) => {
    const id = str(body, "id");
    if (body.kind === "project") return deleteProjectTemplate(actor.id, actor.role, id);
    if (body.kind === "task") return deleteTaskTemplate(actor.id, actor.role, id);
    throw new Error('Missing or invalid field: kind (expected "project" or "task")');
  },
  { allow: (r) => canManageTasks(r) },
);
