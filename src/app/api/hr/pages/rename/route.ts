import { action, str } from "@/lib/api";
import { renamePage } from "@/lib/actions/pages";

export const POST = action(async ({ user, body }) =>
  renamePage(user.id, user.role, str(body, "pageId"), str(body, "title")),
);
