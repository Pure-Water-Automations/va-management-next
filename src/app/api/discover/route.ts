import { submitDiscoveryLead, DiscoveryValidationError } from "@/lib/actions/discovery";

// PUBLIC endpoint — leads are not logged in (public page, like /apply). The form
// payload is small; cap the body so a public client can't make us parse/store
// megabytes.
const MAX_BODY_BYTES = 20_000;

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "Submission too large." }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return Response.json({ ok: false, error: "Invalid submission." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: "Invalid submission." }, { status: 400 });
  }
  try {
    const result = await submitDiscoveryLead(body);
    return Response.json({ ok: true, result });
  } catch (err) {
    // Only surface validation messages publicly; log + generalize everything else.
    if (err instanceof DiscoveryValidationError) {
      return Response.json({ ok: false, error: err.message }, { status: 400 });
    }
    console.error("discover submit failed:", err);
    return Response.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
