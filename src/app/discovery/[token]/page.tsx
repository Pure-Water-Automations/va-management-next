import { getBookingByToken } from "@/lib/actions/discovery-booking";
import { ManageBookingClient } from "./ManageBookingClient";

// PUBLIC magic-link page — the lead manages (reschedules / cancels) their call.
export const dynamic = "force-dynamic";
export const metadata = { title: "Your discovery call — Pure Water Automations" };

export default async function DiscoveryManagePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const booking = await getBookingByToken(token).catch(() => null);
  return <ManageBookingClient token={token} booking={booking} />;
}
