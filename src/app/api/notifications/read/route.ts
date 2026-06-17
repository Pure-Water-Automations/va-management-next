import { action, str } from "@/lib/api";
import { markNotificationRead } from "@/lib/inbox";

export const POST = action(async ({ user, body }) => markNotificationRead(user.id, str(body, "id")));
