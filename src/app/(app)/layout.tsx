import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, getEffectiveView, getEffectiveVaId, isFounder, isBetaOn, isBetaVisible } from "@/lib/auth/access";
import { canUserDelegateTasks } from "@/lib/auth/delegation";
import { db } from "@/lib/db";
import { getNotifications } from "@/lib/inbox";
import { Sidebar } from "@/components/Sidebar";
import { AdminBar } from "@/components/AdminBar";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandPalette } from "@/components/CommandPalette";
import { Purii } from "@/components/Purii";
import { tourForView } from "@/lib/purii";

// Authenticated console shell. Everything under (app)/ requires a Google
// login session; public routes (e.g. /track) live outside this group.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const view = await getEffectiveView(user);
  if (view === "CLIENT") redirect("/client");
  let adminVas: { vaId: string; name: string }[] = [];
  let impersonatedVaId: string | null = null;
  if (user.isAdmin) {
    [adminVas, impersonatedVaId] = await Promise.all([
      db.va.findMany({
        where: { status: { in: ["active", "training"] } },
        orderBy: { name: "asc" },
        select: { vaId: true, name: true },
      }),
      getEffectiveVaId(user),
    ]);
  }

  // Delegation authority is comp-role-driven (a Senior VA / any tier flagged on the
  // Compensation Roles screen), so the VA-console Delegation nav follows it, not the role.
  // When an admin uses "View as → as VA", reflect the IMPERSONATED VA's own authority so
  // the preview matches what that VA actually sees — otherwise the admin's always-allowed
  // authority wrongly shows the Delegation nav for a plain VA (e.g. a trainee).
  let canDelegate: boolean;
  if (user.isAdmin && view === "VA" && impersonatedVaId && impersonatedVaId !== user.vaId) {
    // Map the impersonated VA → its login by EMAIL (Va.email is unique and matches
    // User.email). Keying on User.vaId is unreliable — some logins aren't linked to
    // their VA row (e.g. Aira), which would wrongly hide the Delegation nav.
    const impVa = await db.va.findUnique({
      where: { vaId: impersonatedVaId },
      select: { email: true },
    });
    const impUser = impVa
      ? await db.user.findUnique({ where: { email: impVa.email }, select: { id: true, role: true } })
      : null;
    canDelegate = impUser ? await canUserDelegateTasks(impUser.id, impUser.role) : false;
  } else {
    canDelegate = await canUserDelegateTasks(user.id, user.role);
  }

  // Beta features (Enhance / Discover / Recordings) are founder-only and runtime-
  // toggleable so the founder can hide them on demand (e.g. while demoing to VAs).
  const betaVisible = await isBetaVisible(user.email);
  const betaOn = await isBetaOn();
  const notifications = await getNotifications(user.id);
  const unread = notifications.filter((n) => !n.read).length;

  return (
    <>
      {/* Mobile nav: hamburger toggles the sidebar drawer (CSS-only). */}
      <input type="checkbox" id="nav-toggle" className="nav-toggle-cb" aria-hidden="true" defaultChecked={false} />
      <label htmlFor="nav-toggle" className="nav-burger" aria-label="Toggle menu">☰</label>
      <div className="app-shell">
        <label htmlFor="nav-toggle" className="nav-backdrop" aria-hidden="true" />
        <Sidebar view={view} role={user.role} name={user.name ?? user.email} isAdmin={user.isAdmin} showBeta={betaVisible} canDelegate={canDelegate} />
        <main className="content" style={{ padding: 0 }}>
          {user.isAdmin && (
            <AdminBar
              currentView={view}
              vas={adminVas}
              currentVaId={impersonatedVaId}
              showBetaToggle={isFounder(user.email)}
              betaOn={betaOn}
            />
          )}
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 12,
              padding: "8px 24px 0",
            }}
          >
            <NotificationBell notifications={notifications} unreadCount={unread} />
          </div>
          <div className="content-pad">{children}</div>
        </main>
      </div>
      <CommandPalette />
      <Purii tour={tourForView(view)} canBypass={user.isAdmin} />
    </>
  );
}
