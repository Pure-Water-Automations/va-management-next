import { DiscoverClient } from "./DiscoverClient";
import { db } from "@/lib/db";

// PUBLIC page (outside the (app) auth shell). Add /discover + /api/discover to the
// Cloudflare Access bypass so they're reachable without a login.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Discover — Pure Water Automations",
  description: "A quick conversation about getting your time back. Book a free discovery call.",
};

export default async function DiscoverPage() {
  let adminCostRate = 25;
  let bookingUrl: string | null = null;
  let testimonial: string | null = null;
  try {
    const rows = await db.setting.findMany({
      where: { key: { in: ["admin_cost_rate", "discovery_booking_url", "discovery_testimonials"] } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, (r.value ?? "").trim()]));
    const rate = Number(map.get("admin_cost_rate"));
    if (Number.isFinite(rate) && rate > 0) adminCostRate = rate;
    bookingUrl = map.get("discovery_booking_url") || null;
    testimonial = map.get("discovery_testimonials") || null;
  } catch {
    // fall back to defaults if the DB is unreachable
  }
  return <DiscoverClient adminCostRate={adminCostRate} bookingUrl={bookingUrl} testimonial={testimonial} />;
}
