import { action, str } from "@/lib/api";
import { deleteLink } from "@/lib/actions/links";

export const POST = action(async ({ user, body }) =>
  deleteLink(user.id, user.role, str(body, "linkId")),
);
