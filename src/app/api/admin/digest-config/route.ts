import { action } from "@/lib/api";
import { db } from "@/lib/db";

// Toggle the daily task-digest email (notification_digest_enabled). Admin-only
// (allow:()=>false → only isAdmin passes the wrapper). Body: { enabled: boolean }.
export const POST = action(
  async ({ body }) => {
    const value = body.enabled ? "TRUE" : "FALSE";
    await db.setting.upsert({
      where: { key: "notification_digest_enabled" },
      update: { value },
      create: { key: "notification_digest_enabled", value },
    });
    return { ok: true };
  },
  { allow: () => false },
);
