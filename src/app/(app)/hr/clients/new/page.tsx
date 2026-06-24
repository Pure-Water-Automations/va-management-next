import { getCurrentUser } from "@/lib/auth/access";
import { redirect } from "next/navigation";
import Link from "next/link";
import { NewClientOrgForm } from "@/components/NewClientOrgForm";

export const dynamic = "force-dynamic";

// Gate matches POST /api/hr/clients (HR Manager / People Ops / admin).
export default async function NewClientOrgPage() {
  const user = await getCurrentUser();
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !user.isAdmin) {
    redirect("/hr/clients");
  }
  return (
    <div style={{ maxWidth: 560, padding: 24 }}>
      <Link href="/hr/clients" style={{ fontSize: 13, color: "var(--color-text-secondary)", textDecoration: "none" }}>
        ← Organizations
      </Link>
      <h1 style={{ fontSize: 22, fontWeight: 600, margin: "12px 0 20px" }}>New client organization</h1>
      <NewClientOrgForm />
    </div>
  );
}
