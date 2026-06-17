import { action, str } from "@/lib/api";
import { getRecordingDetail } from "@/lib/reads/recordings";

export const POST = action(
  async ({ user, body }) => {
    const detail = await getRecordingDetail(user, str(body, "recordingId"));
    if (!detail) throw new Error("Recording not found.");
    return detail;
  },
  { allow: () => false },
);
