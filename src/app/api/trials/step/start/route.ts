import type { StepStartRequest, StepStartResponse } from "@/lib/trial/types";
import { startStep } from "@/lib/trial/engine";
import { candidateRoute, jsonBody } from "../../_route";

export function POST(request: Request) {
  return candidateRoute(request, async (candidate): Promise<StepStartResponse> => {
    const body = await jsonBody<StepStartRequest>(request);
    return startStep(candidate.candidateId, body.stepId);
  });
}
