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
  // Admins bypass; client-portal users are let through so they can comment on
  // videos shared with their org. addComment() does the per-recording check.
  { allow: (role) => role === "CLIENT_ADMIN" || role === "CLIENT_MEMBER" },
);
