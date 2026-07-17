import type { StepPauseRequest, StepPauseResponse } from "@/lib/trial/types";
import { pauseStep } from "@/lib/trial/engine";
import { candidateRoute, jsonBody } from "../../_route";

export function POST(request: Request) {
  return candidateRoute(request, async (candidate): Promise<StepPauseResponse> => {
    const body = await jsonBody<StepPauseRequest>(request);
    return pauseStep(candidate.candidateId, body.stepId);
  });
}
