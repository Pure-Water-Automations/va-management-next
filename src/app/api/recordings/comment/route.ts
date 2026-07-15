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
  // Every role is let through the door — staff commenting on their own/reports'
  // recordings and clients commenting on videos shared with their org are both
  // legitimate; addComment() does the actual per-recording visibility check.
  { allow: () => true },
);
