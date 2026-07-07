import { action, str, optStr } from "@/lib/api";
import { createFieldDef } from "@/lib/actions/fields";

// No `allow` guard — createFieldDef enforces canManageTasks itself.
export const POST = action(async ({ user, body }) =>
  createFieldDef(user.id, user.role, {
    name: str(body, "name"),
    type: optStr(body, "type"),
    projectId: optStr(body, "projectId"),
    options: body.options,
    clientVisible: body.clientVisible === true,
  }),
);
