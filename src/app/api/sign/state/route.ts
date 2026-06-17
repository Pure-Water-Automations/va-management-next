import { getSignState } from "@/lib/actions/contract";

// PUBLIC — must be on the Cloudflare Access bypass (alongside /apply, /sign).
export async function POST(request: Request): Promise<Response> {
  try {
    const { token } = (await request.json()) as { token?: string };
    if (!token) return Response.json({ ok: false, error: "Missing token" }, { status: 400 });
    const state = await getSignState(token);
    return Response.json(state);
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
}
