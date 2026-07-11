import type { TrialStateResponse } from "@/lib/trial/types";
import { getTrialState } from "@/lib/trial/engine";
import { candidateRoute } from "../_route";

export function GET(request: Request) {
  return candidateRoute(request, async (candidate): Promise<TrialStateResponse> =>
    getTrialState(candidate.candidateId, true),
  );
}
