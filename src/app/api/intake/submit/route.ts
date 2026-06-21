import { submitIntake } from "@/lib/actions/client-onboarding";

// PUBLIC — must be on the Cloudflare Access bypass.
export async function POST(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as { token?: string; answers?: Record<string, unknown> };
    if (!body.token) return Response.json({ ok: false, error: "Missing token" }, { status: 400 });
    const result = await submitIntake(body.token, body.answers ?? {});
    return Response.json(result);
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
