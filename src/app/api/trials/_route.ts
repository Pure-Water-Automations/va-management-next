import { NextResponse } from "next/server";
import {
  resolveTrialCandidate,
  skillsTrialV2Enabled,
  TrialEngineError,
  type ResolvedTrialCandidate,
} from "@/lib/trial/engine";

type CandidateHandler = (candidate: ResolvedTrialCandidate) => Promise<unknown>;

function bearerToken(request: Request): string {
  const match = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization")?.trim() ?? "");
  return match?.[1] ?? "";
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof TrialEngineError) {
    const status =
      error.code === "INVALID_TOKEN" ? 401 :
      error.code === "TRIAL_NOT_OPEN" ? 403 :
      error.code === "TRIAL_NOT_FOUND" || error.code === "MISSION_NOT_FOUND" ? 404 :
      error.code === "ILLEGAL_TRANSITION" ? 409 :
      error.code === "NO_ACTIVE_PROGRAM" ? 503 : 400;
    return NextResponse.json(
      { error: error.code, message: error.message, ...(error.completionStatus ? { completionStatus: error.completionStatus } : {}) },
      { status },
    );
  }
  console.error("[trial-api]", error);
  return NextResponse.json({ error: "INTERNAL_ERROR", message: "Unable to complete the trial request." }, { status: 500 });
}

export async function candidateRoute(request: Request, handler: CandidateHandler): Promise<NextResponse> {
  if (!skillsTrialV2Enabled()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const candidate = await resolveTrialCandidate(bearerToken(request));
    return NextResponse.json(await handler(candidate));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function jsonBody<T>(request: Request): Promise<T> {
  try {
    const body: unknown = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new TrialEngineError("VALIDATION", "Request body must be a JSON object.");
    }
    return body as T;
  } catch (error) {
    if (error instanceof TrialEngineError) throw error;
    throw new TrialEngineError("VALIDATION", "Request body must be valid JSON.");
  }
}
