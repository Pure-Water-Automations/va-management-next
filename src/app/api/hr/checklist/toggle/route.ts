import { action, str } from "@/lib/api";
import { toggleChecklistItem } from "@/lib/actions/checklist";

export const POST = action(async ({ user, body }) =>
  toggleChecklistItem(user.id, user.role, str(body, "id")),
);
