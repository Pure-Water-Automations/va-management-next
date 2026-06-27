import { getOpenSlots } from "@/lib/actions/discovery-booking";

// PUBLIC — the discovery slot picker fetches open call times (no login).
export async function GET(): Promise<Response> {
  try {
    const slots = await getOpenSlots();
    return Response.json({ ok: true, slots });
  } catch (err) {
    console.error("discover slots failed:", err);
    return Response.json({ ok: false, slots: [] }, { status: 500 });
  }
}
