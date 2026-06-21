import { IntakeClient } from "./IntakeClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "PWA — Client onboarding intake" };

export default async function IntakePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <IntakeClient token={token} />;
}
