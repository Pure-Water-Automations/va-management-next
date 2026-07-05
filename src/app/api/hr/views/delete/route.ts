import { action, str } from "@/lib/api";
import { deleteSavedView } from "@/lib/actions/views";

export const POST = action(
  async ({ user, body }) => deleteSavedView(user.id, user.role, str(body, "id")),
  { allowUser: (u) => u.caps.manageTasks },
);
