import { completeTask } from "@/lib/actions/training";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const token = body?.token;
    const assignmentId = body?.assignmentId;
    if (typeof token !== "string" || !token.trim()) throw new Error("Missing field: token");
    if (typeof assignmentId !== "string" || !assignmentId.trim()) throw new Error("Missing field: assignmentId");
    const outputLink = typeof body?.outputLink === "string" ? body.outputLink : undefined;
    const note = typeof body?.note === "string" ? body.note : undefined;
    const result = await completeTask(token, assignmentId, outputLink, note);
    return Response.json({ ok: true, result });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Action failed" }, { status: 400 });
  }
}
