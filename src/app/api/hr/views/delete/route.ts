import { action, str } from "@/lib/api";
import { deleteSavedView } from "@/lib/actions/views";

export const POST = action(
  async ({ actor, body }) => deleteSavedView(actor.id, actor.role, str(body, "id")),
  { allowUser: (u) => u.caps.manageTasks },
);
