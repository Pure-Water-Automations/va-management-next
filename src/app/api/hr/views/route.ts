import { action } from "@/lib/api";
import { createSavedView } from "@/lib/actions/views";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ actor, body }) =>
    createSavedView(actor.id, actor.role, { name: body.name, scope: body.scope, query: body.query }),
  { allow: (r) => canManageTasks(r) },
);
