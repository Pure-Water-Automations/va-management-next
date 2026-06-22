import { action, str } from "@/lib/api";
import { startEnhanceRecording } from "@/lib/actions/recordings";

// Kick off an Auto-enhance (tighten via Video Core). Returns immediately with
// status "processing"; the detail view polls /api/recordings/get for completion.
export const POST = action(
  async ({ user, body }) => startEnhanceRecording(user, { recordingId: str(body, "recordingId") }),
  { allow: () => false },
);
