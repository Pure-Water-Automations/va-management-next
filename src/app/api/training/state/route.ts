import { getCandidateState } from "@/lib/actions/training";

function readToken(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid JSON body");
  }
  const token = (body as Record<string, unknown>).token;
  if (typeof token !== "string" || token.trim() === "") throw new Error("Missing field: token");
  return token;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as unknown;
    const result = await getCandidateState(readToken(body));
    return Response.json({ ok: true, result });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Action failed";
    return Response.json({ ok: false, error }, { status: 400 });
  }
}
