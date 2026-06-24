import { recordingsAction, str, optStr } from "@/lib/api";
import { reviewRecording } from "@/lib/actions/recordings";

export const POST = recordingsAction(
  async ({ user, body }) =>
    reviewRecording(user, {
      recordingId: str(body, "recordingId"),
      reviewStatus: str(body, "reviewStatus"),
      reviewNotes: optStr(body, "reviewNotes"),
    }),
  { allow: () => false },
);
