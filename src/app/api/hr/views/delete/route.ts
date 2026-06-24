import { action, str } from "@/lib/api";
import { deleteSavedView } from "@/lib/actions/views";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ actor, body }) => deleteSavedView(actor.id, actor.role, str(body, "id")),
  { allow: (r) => canManageTasks(r) },
);
