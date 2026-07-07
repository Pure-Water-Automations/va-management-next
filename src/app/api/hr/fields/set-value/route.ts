import { action, str, optStr } from "@/lib/api";
import { setFieldValue } from "@/lib/actions/fields";

// value may legitimately be "" (= clear), so it is read raw, not via str().
export const POST = action(async ({ user, body }) =>
  setFieldValue(user.id, user.role, {
    fieldId: str(body, "fieldId"),
    taskId: optStr(body, "taskId"),
    projectId: optStr(body, "projectId"),
    value: typeof body.value === "string" ? body.value : "",
  }),
);
