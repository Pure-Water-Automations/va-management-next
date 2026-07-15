import { recordingsAction, str, optStr } from "@/lib/api";
import { reviewRecording } from "@/lib/actions/recordings";

export const POST = recordingsAction(
  async ({ user, body }) =>
    reviewRecording(user, {
      recordingId: str(body, "recordingId"),
      reviewStatus: str(body, "reviewStatus"),
      reviewNotes: optStr(body, "reviewNotes"),
    }),
  // reviewRecording() itself checks admin / gate-reviewer / direct-supervisor —
  // this door just needs to exclude clients, who never review recordings.
  { allow: (role) => role !== "CLIENT_ADMIN" && role !== "CLIENT_MEMBER" },
);
