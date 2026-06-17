import { action } from "@/lib/api";
import { markAllNotificationsRead } from "@/lib/inbox";

export const POST = action(async ({ user }) => markAllNotificationsRead(user.id));
