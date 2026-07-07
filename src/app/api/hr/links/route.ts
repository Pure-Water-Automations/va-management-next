import { action, str } from "@/lib/api";
import { createLink } from "@/lib/actions/links";

export const POST = action(async ({ user, body }) =>
  createLink(user.id, user.role, {
    fromType: str(body, "fromType"),
    fromId: str(body, "fromId"),
    toType: str(body, "toType"),
    toId: str(body, "toId"),
    label: str(body, "label"),
  }),
);
