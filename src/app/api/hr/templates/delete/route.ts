import { action, str } from "@/lib/api";
import { deleteProjectTemplate, deleteTaskTemplate } from "@/lib/actions/templates";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) => {
    const id = str(body, "id");
    if (body.kind === "project") return deleteProjectTemplate(user.id, user.role, id);
    if (body.kind === "task") return deleteTaskTemplate(user.id, user.role, id);
    throw new Error('Missing or invalid field: kind (expected "project" or "task")');
  },
  { allow: (r) => canManageTasks(r) },
);
