import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, getEffectiveView, getEffectiveVaId, getEffectiveActor, isFounder, isBetaOn, isRecordingsVisible } from "@/lib/auth/access";
import { canUserDelegateTasks } from "@/lib/auth/delegation";
import { db } from "@/lib/db";
import { getNotifications } from "@/lib/inbox";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { VaTopNav } from "@/components/VaTopNav";
import { AdminBar } from "@/components/AdminBar";
import { SelfViewToggle } from "@/components/SelfViewToggle";
import { CommandPalette } from "@/components/CommandPalette";
import { viewForRole } from "@/lib/auth/roles";
import { humanRole } from "@/lib/labels";
import { Purii } from "@/components/Purii";
import { tourForView } from "@/lib/purii";

const EYEBROW: Record<string, string> = {
  HR: "HR Operations",
  PAYROLL: "Payroll",
  RECRUITMENT: "Recruitment",
  VA: "My Console",
};

function vaRoleLabel(role: string): string {
  if (role === "SENIOR_VA") return "Senior VA";
  if (role === "VA") return "Virtual Assistant";
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// Applies the persisted sidebar-collapsed preference before paint (no flash).
const COLLAPSE_INIT = `(function(){try{if(localStorage.getItem('sidebarCollapsed')==='1'){document.documentElement.dataset.sidebarCollapsed='1';}}catch(e){}})();`;

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

  // Every VA-console capability/identity gate runs against the EFFECTIVE actor, so
  // an admin's "View as → as VA" preview matches exactly what that VA sees and can
  // do. Outside VA-impersonation (and for non-admins) the actor IS the logged-in
  // user, so HR/Payroll/Recruitment views are unchanged. Delegation authority is
  // comp-role-driven (canUserDelegateTasks reads the actor's tier flag).
  const actor = await getEffectiveActor(user);
  const canDelegate = await canUserDelegateTasks(actor.id, actor.role);

  // Recordings is an admin/founder feature (not a VA tier feature), so under VA
  // impersonation isRecordingsVisible(actor) is false — a real VA never sees it.
  const showRecordings = isRecordingsVisible(actor);
  const betaOn = await isBetaOn();
  const notifications = await getNotifications(user.id);
  const unread = notifications.filter((n) => !n.read).length;
  // Meeting Actions is a delegation feature (its whole purpose is turning meeting
  // notes into delegated tasks), so it's gated on delegation authority — only those
  // who can delegate see it, mirroring the impersonated VA under "View as".
  const showMeetingActions = canDelegate;
  const meetingActionsCount = showMeetingActions
    ? await db.meetingAction.count({ where: { status: "PENDING", items: { some: { status: "PENDING" } } } })
    : 0;

  // Identity shown in the nav follows the actor too (the impersonated VA's name +
  // role pill), so the chrome doesn't contradict the impersonated body content.
  const userName = actor.name ?? actor.email;
  const adminBar = user.isAdmin ? (
    <AdminBar
      currentView={view}
      vas={adminVas}
      currentVaId={impersonatedVaId}
      showBetaToggle={isFounder(user.email)}
      betaOn={betaOn}
    />
  ) : null;

  // A non-admin VA-linked user (e.g. Riza, Princess) can toggle between their
  // management console and their own VA console. Never show the full AdminBar.
  const selfToggle = !user.isAdmin && !!user.vaId;
  const ROLE_HOME: Record<string, string> = { HR: "/hr", PAYROLL: "/payroll", RECRUITMENT: "/recruitment", VA: "/va" };
  const roleView = viewForRole(user.role);
  const roleHome = ROLE_HOME[roleView] ?? "/va";
  const roleLabel = humanRole(roleView);
  const selfViewBar = selfToggle ? (
    <SelfViewToggle mode={view === "VA" ? "toManagement" : "toVa"} roleLabel={roleLabel} roleHome={roleHome} />
  ) : null;

  // VA console: lightweight glass top-nav shell (no sidebar), centered content.
  if (view === "VA") {
    return (
      <>
        <script dangerouslySetInnerHTML={{ __html: COLLAPSE_INIT }} />
        <div style={{ minHeight: "100vh", background: "var(--color-bg-secondary)" }}>
          {adminBar}
          {selfViewBar}
          <VaTopNav
            name={userName}
            roleLabel={vaRoleLabel(actor.role)}
            canDelegate={canDelegate}
            showMeetingActions={showMeetingActions}
            meetingActionsCount={meetingActionsCount}
            showRecordings={showRecordings}
            notifications={notifications}
            unreadCount={unread}
          />
          <div className="topnav-content">{children}</div>
        </div>
        <CommandPalette canDelegate={canDelegate} />
        <Purii tour={tourForView(view)} canBypass={actor.isAdmin} />
      </>
    );
  }

  // HR / Payroll / Recruitment: collapsible navy sidebar + glass top bar.
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: COLLAPSE_INIT }} />
      {/* Mobile nav: hamburger toggles the sidebar drawer (CSS-only). */}
      <input type="checkbox" id="nav-toggle" className="nav-toggle-cb" aria-hidden="true" defaultChecked={false} />
      <label htmlFor="nav-toggle" className="nav-burger" aria-label="Toggle menu">☰</label>
      <div className="app-shell">
        <label htmlFor="nav-toggle" className="nav-backdrop" aria-hidden="true" />
        <Sidebar
          view={view}
          role={user.role}
          name={userName}
          isAdmin={user.isAdmin}
          showRecordings={showRecordings}
          showMeetingActions={showMeetingActions}
          meetingActionsCount={meetingActionsCount}
        />
        <main className="content" style={{ padding: 0 }}>
          {adminBar}
          {selfViewBar}
          <Topbar eyebrow={EYEBROW[view] ?? "Console"} notifications={notifications} unreadCount={unread} />
          <div className="content-pad">{children}</div>
        </main>
      </div>
      <CommandPalette canDelegate={canDelegate} />
      <Purii tour={tourForView(view)} canBypass={user.isAdmin} />
    </>
  );
}
