import type { EscalateRequest, EscalateResponse } from "@/lib/trial/types";
import { escalateTrial } from "@/lib/trial/engine";
import { candidateRoute, jsonBody } from "../_route";

export function POST(request: Request) {
  return candidateRoute(request, async (candidate): Promise<EscalateResponse> => {
    await escalateTrial(candidate.candidateId, await jsonBody<EscalateRequest>(request));
    return { ok: true };
  });
}
