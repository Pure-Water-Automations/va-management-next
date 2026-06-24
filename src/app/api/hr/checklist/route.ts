import { action, str } from "@/lib/api";
import { addChecklistItem } from "@/lib/actions/checklist";

// No `allow` guard — any authenticated user may call; addChecklistItem enforces
// canUserActOnTask internally so assigned VAs can manage their own task's items.
export const POST = action(async ({ actor, body }) =>
  addChecklistItem(actor.id, actor.role, str(body, "taskId"), str(body, "text")),
);
