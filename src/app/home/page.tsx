import { db } from "@/lib/db";
import { LandingPage } from "@/components/landing/LandingPage";

// PUBLIC marketing landing page (outside the (app) auth shell, like /discover).
// Add /home to the Cloudflare Access bypass so it's reachable without a login.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pure Water Automations — Get 10+ hours of your week back.",
  description:
    "A trained, supervised assistant plus clean systems — for nonprofits, ministries, and small teams drowning in admin.",
};

export default async function HomeLandingPage() {
  let adminCostRate = 22;
  try {
    const row = await db.setting.findUnique({ where: { key: "admin_cost_rate" }, select: { value: true } });
    const rate = Number((row?.value ?? "").trim());
    if (Number.isFinite(rate) && rate > 0) adminCostRate = rate;
  } catch {
    // fall back to the default if the DB is unreachable
  }
  return <LandingPage adminCostRate={adminCostRate} />;
}
