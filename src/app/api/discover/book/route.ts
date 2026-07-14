import { bookDiscoveryCall, cancelDiscoveryCall, BookingError } from "@/lib/actions/discovery-booking";

// PUBLIC — the lead books / reschedules / cancels their discovery call by token
// (the capability returned at submit, also used by /discovery/[token]).
export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();
  if (raw.length > 4_000) return Response.json({ ok: false, error: "Invalid request." }, { status: 413 });
  let body: { token?: unknown; startIso?: unknown; action?: unknown };
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
    }
    body = parsed as typeof body;
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const action = body.action === "cancel" ? "cancel" : "book";
  const startIso = typeof body.startIso === "string" ? body.startIso : "";

  try {
    if (action === "cancel") {
      const result = await cancelDiscoveryCall(token);
      return Response.json({ ok: true, result });
    }
    if (!startIso) return Response.json({ ok: false, error: "Please pick a time." }, { status: 400 });
    const result = await bookDiscoveryCall(token, startIso);
    return Response.json({ ok: true, result });
  } catch (err) {
    if (err instanceof BookingError) return Response.json({ ok: false, error: err.message }, { status: 400 });
    console.error("discover book failed:", err);
    return Response.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 500 });
  }
}
