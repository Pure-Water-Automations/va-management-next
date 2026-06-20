import { getIntakeState } from "@/lib/actions/client-onboarding";

// PUBLIC — must be on the Cloudflare Access bypass (alongside /apply, /sign).
export async function POST(request: Request): Promise<Response> {
  try {
    const { token } = (await request.json()) as { token?: string };
    if (!token) return Response.json({ ok: false, error: "Missing token" }, { status: 400 });
    return Response.json(await getIntakeState(token));
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
