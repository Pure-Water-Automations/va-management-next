import { recordingsAction, optStr } from "@/lib/api";
import { createRecording } from "@/lib/actions/recordings";

// Any staff role can record; clients never reach the recorder UI (they only view
// videos shared to their org). isRecordingsVisible() gates the page itself.
export const POST = recordingsAction(
  async ({ user, body }) =>
    createRecording(user, {
      mimeType: optStr(body, "mimeType"),
      title: optStr(body, "title"),
      project: optStr(body, "project"),
      task: optStr(body, "task"),
    }),
  { allow: (role) => role !== "CLIENT_ADMIN" && role !== "CLIENT_MEMBER" },
);
