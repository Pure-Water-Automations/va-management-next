import { action, str, optStr } from "@/lib/api";
import { promoteScratchItem } from "@/lib/actions/scratch";

export const POST = action(async ({ user, body }) =>
  promoteScratchItem(user.id, user.role, str(body, "itemId"), {
    assignedToId: optStr(body, "assignedToId"),
    dueDate: optStr(body, "dueDate"),
  }),
);
