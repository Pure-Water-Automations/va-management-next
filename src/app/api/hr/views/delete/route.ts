import { action, str } from "@/lib/api";
import { deleteSavedView } from "@/lib/actions/views";
import { canManageTasks } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) => deleteSavedView(user.id, user.role, str(body, "id")),
  { allow: (r) => canManageTasks(r) },
);
