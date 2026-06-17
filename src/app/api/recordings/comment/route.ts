import { action, str, optStr, optNum } from "@/lib/api";
import { addComment } from "@/lib/actions/recordings";

export const POST = action(
  async ({ user, body }) =>
    addComment(user, {
      recordingId: str(body, "recordingId"),
      body: optStr(body, "body"),
      reaction: optStr(body, "reaction"),
      timestampSec: optNum(body, "timestampSec"),
    }),
  { allow: () => false },
);
