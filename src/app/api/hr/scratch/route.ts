import { action, str } from "@/lib/api";
import { addScratchItem } from "@/lib/actions/scratch";

export const POST = action(async ({ user, body }) =>
  addScratchItem(user.id, user.role, str(body, "projectId"), str(body, "text")),
);
