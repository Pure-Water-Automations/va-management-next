import { action, str } from "@/lib/api";
import { addChecklistItem } from "@/lib/actions/checklist";

// No `allow` guard — any authenticated user may call; addChecklistItem enforces
// canUserActOnTask internally so assigned VAs can manage their own task's items.
export const POST = action(async ({ user, body }) =>
  addChecklistItem(user.id, user.role, str(body, "taskId"), str(body, "text")),
);
