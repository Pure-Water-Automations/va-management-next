import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";

export default async function ClientLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  assertClientRole(user);

  const membership = await getClientMembership(user.id);
  if (!membership || !membership.clientOrganization.active) {
    redirect("/client/no-access");
  }

  const orgName = membership.clientOrganization.name;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <nav style={{ display: "flex", alignItems: "center", gap: 24, padding: "12px 24px", borderBottom: "1px solid var(--border)", background: "var(--surface)" }}>
        <span style={{ fontWeight: 600, fontSize: 15 }}>{orgName}</span>
        <a href="/client" style={{ fontSize: 14 }}>Dashboard</a>
        <a href="/client/projects" style={{ fontSize: 14 }}>Projects</a>
        <a href="/client/requests" style={{ fontSize: 14 }}>Requests</a>
        <span style={{ marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" }}>
          {user.name ?? user.email}
        </span>
      </nav>
      <main style={{ flex: 1, padding: "24px" }}>{children}</main>
    </div>
  );
}
