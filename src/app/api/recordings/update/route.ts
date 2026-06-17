import { action, str, optStr } from "@/lib/api";
import { updateRecording } from "@/lib/actions/recordings";

export const POST = action(
  async ({ user, body }) =>
    updateRecording(user, {
      recordingId: str(body, "recordingId"),
      title: optStr(body, "title"),
      description: optStr(body, "description"),
      project: optStr(body, "project"),
      task: optStr(body, "task"),
      visibility: optStr(body, "visibility"),
    }),
  { allow: () => false },
);
