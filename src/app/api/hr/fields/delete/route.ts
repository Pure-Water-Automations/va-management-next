import { action, str } from "@/lib/api";
import { deleteFieldDef } from "@/lib/actions/fields";

export const POST = action(async ({ user, body }) =>
  deleteFieldDef(user.id, user.role, str(body, "fieldId")),
);
