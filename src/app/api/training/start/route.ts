import { startTask } from "@/lib/actions/training";

function field(body: unknown, key: string): string {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
  const v = (body as Record<string, unknown>)[key];
  if (typeof v !== "string" || v.trim() === "") throw new Error(`Missing field: ${key}`);
  return v;
}

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as unknown;
    const result = await startTask(field(body, "token"), field(body, "assignmentId"));
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Action failed" }, { status: 400 });
  }
}
