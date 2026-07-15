import { getPublicRecordingByToken } from "@/lib/reads/recordings";

function readToken(body: unknown): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid JSON body");
  }
  const token = (body as Record<string, unknown>).token;
  if (typeof token !== "string" || token.trim() === "") throw new Error("Missing field: token");
  return token;
}

// No auth — the token itself is the credential, same as a Loom share link.
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as unknown;
    const result = await getPublicRecordingByToken(readToken(body));
    if (!result) return Response.json({ ok: false, error: "Not found" }, { status: 404 });
    return Response.json({ ok: true, result });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Action failed";
    return Response.json({ ok: false, error }, { status: 400 });
  }
}
