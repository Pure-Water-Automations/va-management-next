import { stopTask } from "@/lib/actions/training";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = body?.token;
    if (typeof token !== "string" || !token.trim()) throw new Error("Missing field: token");
    const result = await stopTask(token);
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Action failed" }, { status: 400 });
  }
}
