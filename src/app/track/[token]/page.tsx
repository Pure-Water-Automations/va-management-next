import { TrackClient } from "./TrackClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "PWA — 10-Hour Training" };

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <TrackClient token={token} />;
}
