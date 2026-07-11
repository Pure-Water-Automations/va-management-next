import type { TrialMessagesResponse } from "@/lib/trial/types";
import { getTrialMessages } from "@/lib/trial/engine";
import { candidateRoute } from "../_route";

export function GET(request: Request) {
  return candidateRoute(request, async (candidate): Promise<TrialMessagesResponse> =>
    getTrialMessages(candidate.candidateId),
  );
}
