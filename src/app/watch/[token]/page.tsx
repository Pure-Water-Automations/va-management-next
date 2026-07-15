import { WatchClient } from "./WatchClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "PWA — Shared Recording" };

export default async function WatchPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <WatchClient token={token} />;
}
