import { submitApplication } from "@/lib/actions/apply";

// PUBLIC endpoint — applicants are not logged in. Must be added to the
// Cloudflare Access bypass (alongside /apply) so it's reachable without login.
export async function POST(request: Request): Promise<Response> {
  let body: Record<string, unknown> = {};
  try {
    const raw = await request.text();
    body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid submission." }, { status: 400 });
  }
  try {
    const result = await submitApplication(body);
    return Response.json({ ok: true, result });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Submission failed.";
    return Response.json({ ok: false, error }, { status: 400 });
  }
}
