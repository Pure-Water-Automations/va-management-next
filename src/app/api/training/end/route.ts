import { endSession } from "@/lib/actions/training";

function readBody(body: unknown): { token: string; workNotes?: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Invalid JSON body");
  }
  const record = body as Record<string, unknown>;
  if (typeof record.token !== "string" || record.token.trim() === "") {
    throw new Error("Missing field: token");
  }
  if (record.workNotes !== undefined && typeof record.workNotes !== "string") {
    throw new Error("workNotes must be text");
  }
  return { token: record.token, workNotes: record.workNotes };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = readBody((await request.json()) as unknown);
    const result = await endSession(body.token, body.workNotes);
    return Response.json({ ok: true, result });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Action failed";
    return Response.json({ ok: false, error }, { status: 400 });
  }
}
