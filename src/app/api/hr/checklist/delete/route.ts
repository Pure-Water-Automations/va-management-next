import { action, str } from "@/lib/api";
import { deleteChecklistItem } from "@/lib/actions/checklist";

export const POST = action(async ({ actor, body }) =>
  deleteChecklistItem(actor.id, actor.role, str(body, "id")),
);
