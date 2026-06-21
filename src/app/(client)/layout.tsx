import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { getClientMembership, assertClientRole } from "@/lib/auth/client";
import { ClientNav } from "@/components/client/ClientNav";
import { Avatar } from "@/components/Avatar";

// Role-gates the client portal and requires an active client-org membership.
// /client/no-access lives OUTSIDE this route group (src/app/client/no-access),
// so redirecting there does not loop through this layout.
export default async function ClientLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  assertClientRole(user);

  const membership = await getClientMembership(user.id);
  if (!membership) redirect("/client/no-access");

  const orgName = membership.clientOrganization.name;
  const userName = user.name ?? user.email;

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg-secondary)" }}>
      <header className="topnav">
        <div className="topnav-inner">
          <span className="brand">
            <span className="logo-mark">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/pwa-logo.png" alt="Pure Water Automations" />
            </span>
            <span className="brand-name">{orgName}</span>
          </span>
          <ClientNav />
          <div className="topnav-end">
            <span style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>{userName}</span>
            <Avatar name={userName} size={32} />
            <a href="/api/logout" title="Sign out" aria-label="Sign out" className="icon-btn round" style={{ width: 32, height: 32 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </a>
          </div>
        </div>
      </header>
      <main style={{ flex: 1 }}>
        <div className="topnav-content">{children}</div>
      </main>
    </div>
  );
}
