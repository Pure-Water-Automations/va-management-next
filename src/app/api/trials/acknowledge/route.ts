import type { AcknowledgeRequest, AcknowledgeResponse } from "@/lib/trial/types";
import { acknowledgeTrial } from "@/lib/trial/engine";
import { candidateRoute, jsonBody } from "../_route";

export function POST(request: Request) {
  return candidateRoute(request, async (candidate): Promise<AcknowledgeResponse> =>
    acknowledgeTrial(candidate, await jsonBody<AcknowledgeRequest>(request)),
  );
}
