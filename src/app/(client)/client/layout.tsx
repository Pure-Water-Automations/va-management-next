import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth/access";
import { clientPortalNav } from "@/lib/client-portal/routes";

export const dynamic = "force-dynamic";

function canPreviewClientPortal(role: string, isAdmin: boolean): boolean {
  return isAdmin || role === "HR_MANAGER" || role === "PEOPLE_OPS" || role === "TEAM_LEAD";
}

export default async function ClientPortalLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const canPreview = canPreviewClientPortal(user.role, user.isAdmin);

  return (
    <div style={{ minHeight: "100vh", background: "var(--color-bg)", color: "var(--color-text-primary)" }}>
      <header
        style={{
          borderBottom: "1px solid var(--color-border-subtle)",
          background: "var(--color-surface)",
          padding: "16px 24px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div>
            <div style={{ fontSize: "var(--text-lg)", fontWeight: 800 }}>
              PWA Client Portal
            </div>
            <div className="small" style={{ color: "var(--color-text-secondary)" }}>
              Internal preview shell. External client accounts are not enabled yet.
            </div>
          </div>
          <a className="btn" href="/hr/projects">
            Back to VA Ops
          </a>
        </div>
        {canPreview && (
          <nav style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}>
            {clientPortalNav.map((item) => (
              <a key={item.href} className="btn" href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
        )}
      </header>
      <main style={{ maxWidth: 1180, margin: "0 auto", padding: 24 }}>{children}</main>
    </div>
  );
}
