import { action, str, optNum } from "@/lib/api";
import { finalizeRecording } from "@/lib/actions/recordings";

export const POST = action(
  async ({ user, body }) =>
    finalizeRecording(user, {
      recordingId: str(body, "recordingId"),
      sizeBytes: optNum(body, "sizeBytes"),
      durationSec: optNum(body, "durationSec"),
      trimStartSec: optNum(body, "trimStartSec"),
      trimEndSec: optNum(body, "trimEndSec"),
    }),
  { allow: () => false },
);
