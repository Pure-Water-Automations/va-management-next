import type { ReactNode } from "react";
import { getCurrentUser, getEffectiveView, getEffectiveVaId } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { getNotifications } from "@/lib/inbox";
import { Sidebar } from "@/components/Sidebar";
import { AdminBar } from "@/components/AdminBar";
import { NotificationBell } from "@/components/NotificationBell";
import { CommandPalette } from "@/components/CommandPalette";
import { Purii } from "@/components/Purii";
import { tourForView } from "@/lib/purii";

// Authenticated console shell. Everything under (app)/ requires a Cloudflare
// Access identity; public routes (e.g. /track) live outside this group.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const view = await getEffectiveView(user);
  const notifications = await getNotifications(user.id);
  const unread = notifications.filter((n) => !n.read).length;

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

  return (
    <>
      {/* Mobile nav: hamburger toggles the sidebar drawer (CSS-only). */}
      <input type="checkbox" id="nav-toggle" className="nav-toggle-cb" aria-hidden="true" defaultChecked={false} />
      <label htmlFor="nav-toggle" className="nav-burger" aria-label="Toggle menu">☰</label>
      <div className="app-shell">
        <label htmlFor="nav-toggle" className="nav-backdrop" aria-hidden="true" />
        <Sidebar view={view} role={user.role} name={user.name ?? user.email} isAdmin={user.isAdmin} />
        <main className="content" style={{ padding: 0 }}>
          {user.isAdmin && <AdminBar currentView={view} vas={adminVas} currentVaId={impersonatedVaId} />}
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
