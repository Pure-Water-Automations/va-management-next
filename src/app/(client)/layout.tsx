import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { ClientNav } from "@/components/client/ClientNav";

// Role-gates the client portal and requires an active client-org membership.
// /client/no-access lives OUTSIDE this route group (src/app/client/no-access),
// so redirecting there does not loop through this layout.
export default async function ClientLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  assertClientRole(user);

  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const orgName = membership.clientOrganization.name;

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--color-bg-secondary)",
      }}
    >
      <header
        style={{
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-xs)",
        }}
      >
        <div
          style={{
            maxWidth: 880,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            gap: "var(--space-6)",
            padding: "var(--space-3) var(--space-6)",
          }}
        >
          <span
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: "var(--weight-bold)",
              fontSize: "var(--text-lg)",
              color: "var(--color-text-primary)",
              letterSpacing: "var(--tracking-tight)",
            }}
          >
            {orgName}
          </span>
          <ClientNav />
          <span
            style={{
              marginLeft: "auto",
              fontSize: "var(--text-sm)",
              color: "var(--color-text-tertiary)",
            }}
          >
            {user.name ?? user.email}
          </span>
        </div>
      </header>
      <main style={{ flex: 1, padding: "var(--space-8) var(--space-6)" }}>
        <div style={{ maxWidth: 880, margin: "0 auto" }}>{children}</div>
      </main>
    </div>
  );
}
