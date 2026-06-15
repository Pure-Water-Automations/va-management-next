import type { ReactNode } from "react";
import { getCurrentUser, getEffectiveView, getEffectiveVaId } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";
import { AdminBar } from "@/components/AdminBar";
import { Purii } from "@/components/Purii";
import { tourForView } from "@/lib/purii";

// Authenticated console shell. Everything under (app)/ requires a Cloudflare
// Access identity; public routes (e.g. /track) live outside this group.
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  const view = await getEffectiveView(user);

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
      <div className="app-shell">
        <Sidebar view={view} role={user.role} name={user.name ?? user.email} />
        <main className="content" style={{ padding: 0 }}>
          {user.isAdmin && <AdminBar currentView={view} vas={adminVas} currentVaId={impersonatedVaId} />}
          <div style={{ padding: "36px 40px 80px" }}>{children}</div>
        </main>
      </div>
      <Purii tour={tourForView(view)} canBypass={user.isAdmin} />
    </>
  );
}
