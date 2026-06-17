import { action, str } from "@/lib/api";
import { deleteChecklistItem } from "@/lib/actions/checklist";

export const POST = action(async ({ user, body }) =>
  deleteChecklistItem(user.id, user.role, str(body, "id")),
);
