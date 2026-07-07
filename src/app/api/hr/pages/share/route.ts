import { action, str } from "@/lib/api";
import { setPageSharing } from "@/lib/actions/pages";

export const POST = action(async ({ user, body }) =>
  setPageSharing(user.id, user.role, str(body, "pageId"), {
    ...(typeof body.published === "boolean" ? { published: body.published } : {}),
    ...(typeof body.clientVisible === "boolean" ? { clientVisible: body.clientVisible } : {}),
  }),
);
