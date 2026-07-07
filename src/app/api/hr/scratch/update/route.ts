import { action, str } from "@/lib/api";
import { updateScratchItem } from "@/lib/actions/scratch";

// text may be "" (= delete an unpromoted bullet), so it is read raw.
export const POST = action(async ({ user, body }) =>
  updateScratchItem(
    user.id,
    user.role,
    str(body, "itemId"),
    typeof body.text === "string" ? body.text : "",
  ),
);
