import { action, str } from "@/lib/api";
import { executeAction } from "@/lib/purii-actions";
import { executeRecordEdit } from "@/lib/matrix/record-editor";

// Execute a confirmed Permission Bypass / Matrix action. Admin only.
export const POST = action(
  async ({ user, body }) => {
    const tool = str(body, "tool");
    const args = (body.args ?? {}) as Record<string, unknown>;
    const message = tool === "edit_record"
      ? await executeRecordEdit(args, user.email)
      : await executeAction(tool, args, user.email);
    return { message };
  },
  { allow: () => false },
);
