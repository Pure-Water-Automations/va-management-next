import { getOpenSlots } from "@/lib/actions/discovery-booking";

// PUBLIC — the discovery slot picker fetches open call times (no login). The lead
// never sees which rep, so only times are exposed. Cached briefly to blunt repeated
// unauthenticated hits (each computes availability from the DB).
export async function GET(): Promise<Response> {
  try {
    const slots = (await getOpenSlots()).map((s) => ({ startIso: s.startIso, endIso: s.endIso }));
    return Response.json(
      { ok: true, slots },
      { headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=120" } },
    );
  } catch (err) {
    console.error("discover slots failed:", err);
    return Response.json({ ok: false, slots: [] }, { status: 500 });
  }
}
