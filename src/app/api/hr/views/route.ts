import { action } from "@/lib/api";
import { createSavedView } from "@/lib/actions/views";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) =>
    createSavedView(user.id, user.role, { name: body.name, scope: body.scope, query: body.query }),
  { allow: (r) => canManageTasks(r) },
);
