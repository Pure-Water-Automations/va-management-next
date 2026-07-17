import type { MessageReplyRequest, MessageReplyResponse } from "@/lib/trial/types";
import { replyToMessage } from "@/lib/trial/engine";
import { candidateRoute, jsonBody } from "../../_route";

export function POST(request: Request) {
  return candidateRoute(request, async (candidate): Promise<MessageReplyResponse> =>
    replyToMessage(candidate.candidateId, await jsonBody<MessageReplyRequest>(request)),
  );
}
