import { action, optStr } from "@/lib/api";
import { createRecording } from "@/lib/actions/recordings";

// Admin-only for now: allow:()=>false denies non-admins; admins bypass the guard.
export const POST = action(
  async ({ user, body }) =>
    createRecording(user, {
      mimeType: optStr(body, "mimeType"),
      title: optStr(body, "title"),
      project: optStr(body, "project"),
      task: optStr(body, "task"),
    }),
  { allow: () => false },
);
