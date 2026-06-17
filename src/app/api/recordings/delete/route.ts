import { action, str } from "@/lib/api";
import { deleteRecording } from "@/lib/actions/recordings";

export const POST = action(
  async ({ user, body }) => deleteRecording(user, { recordingId: str(body, "recordingId") }),
  { allow: () => false },
);
