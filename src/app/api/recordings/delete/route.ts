import { recordingsAction, str } from "@/lib/api";
import { deleteRecording } from "@/lib/actions/recordings";

export const POST = recordingsAction(
  async ({ user, body }) => deleteRecording(user, { recordingId: str(body, "recordingId") }),
  { allow: () => false },
);
