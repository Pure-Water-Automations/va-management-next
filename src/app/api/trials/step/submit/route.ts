import type { StepSubmitRequest, StepSubmitResponse } from "@/lib/trial/types";
import { submitStep } from "@/lib/trial/engine";
import { candidateRoute, jsonBody } from "../../_route";

export function POST(request: Request) {
  return candidateRoute(request, async (candidate): Promise<StepSubmitResponse> =>
    submitStep(candidate.candidateId, await jsonBody<StepSubmitRequest>(request)),
  );
}
