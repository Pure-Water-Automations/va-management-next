import { action, str } from "@/lib/api";
import { executeAction } from "@/lib/purii-actions";

// Execute a confirmed Permission Bypass action. Admin only.
export const POST = action(
  async ({ user, body }) => {
    const tool = str(body, "tool");
    const args = (body.args ?? {}) as Record<string, unknown>;
    const message = await executeAction(tool, args, user.email);
    return { message };
  },
  { allow: () => false },
);
