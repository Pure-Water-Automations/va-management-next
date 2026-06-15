import { SignClient } from "./SignClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "PWA — Sign your contract" };

export default async function SignPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <SignClient token={token} />;
}
