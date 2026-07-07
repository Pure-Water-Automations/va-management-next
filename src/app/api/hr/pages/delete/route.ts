import { action, str } from "@/lib/api";
import { deletePage } from "@/lib/actions/pages";

export const POST = action(async ({ user, body }) =>
  deletePage(user.id, user.role, str(body, "pageId")),
);
