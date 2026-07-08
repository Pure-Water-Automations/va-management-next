import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, getEffectiveView, getEffectiveVaId, isFounder, isBetaOn, isRecordingsVisible } from "@/lib/auth/access";
import { canUserDelegateTasks, canVaDelegateTasks } from "@/lib/auth/delegation";
import { canReviewMeetingActions } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { isSalesConsoleMode } from "@/lib/mode";
import { getNotifications } from "@/lib/inbox";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { VaTopNav } from "@/components/VaTopNav";
import { AdminBar } from "@/components/AdminBar";
import { CommandPalette } from "@/components/CommandPalette";
import { Purii } from "@/components/Purii";
import { tourForView } from "@/lib/purii";

const EYEBROW: Record<string, string> = {
  HR: "HR Operations",
  PAYROLL: "Payroll",
  RECRUITMENT: "Recruitment",
  SALES: "Sales Console",
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
    const impUser = impVa?.email
      ? await db.user.findUnique({ where: { email: impVa.email.toLowerCase() }, select: { id: true, role: true } })
      : null;
    // If the impersonated VA has a linked login, use its full authority; otherwise
    // (many VAs have no User account yet) judge delegation straight from the VA's
    // comp tier so the preview still reflects what that tier grants.
    canDelegate = impUser
      ? await canUserDelegateTasks(impUser.id, impUser.role)
      : await canVaDelegateTasks(impersonatedVaId);
  } else {
    canDelegate = await canUserDelegateTasks(user.id, user.role);
  }

  // Enhance / Discover stay founder-only + runtime-toggleable (hidden during VA
  // demos). Recordings is broader — open to admins (isRecordingsVisible) so trusted
  // staff (e.g. Aira) can record / review / test.
  const showRecordings = isRecordingsVisible(user);
  const betaOn = await isBetaOn();
  const notifications = await getNotifications(user.id);
  const unread = notifications.filter((n) => !n.read).length;
  const showMeetingActions = user.isAdmin || canReviewMeetingActions(user.role);
  const meetingActionsCount = showMeetingActions
    ? await db.meetingAction.count({ where: { status: "PENDING", items: { some: { status: "PENDING" } } } })
    : 0;

  // Sales-console nav badges: follow-ups due today or overdue, and social
  // posts sitting in the approval queue.
  let navBadges: Record<string, number> = {};
  if (view === "SALES") {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const [followupsDue, socialApprovals] = await Promise.all([
      db.salesFollowUp.count({ where: { doneAt: null, due: { lte: endOfToday } } }),
      db.socialPost.count({ where: { status: "approval" } }),
    ]);
    navBadges = { "/sales/followups": followupsDue, "/marketing/social": socialApprovals };
  }

  const userName = user.name ?? user.email;
  // Sales-console deployments have a single staff view, so the admin
  // view-switcher bar is pure noise there.
  const adminBar = user.isAdmin && !isSalesConsoleMode() ? (
    <AdminBar
      currentView={view}
      vas={adminVas}
      currentVaId={impersonatedVaId}
      showBetaToggle={isFounder(user.email)}
      betaOn={betaOn}
    />
  ) : null;

  // VA console: lightweight glass top-nav shell (no sidebar), centered content.
  if (view === "VA") {
    return (
      <>
        <script dangerouslySetInnerHTML={{ __html: COLLAPSE_INIT }} />
        <div style={{ minHeight: "100vh", background: "var(--color-bg-secondary)" }}>
          {adminBar}
          <VaTopNav
            name={userName}
            roleLabel={vaRoleLabel(user.role)}
            canDelegate={canDelegate}
            showMeetingActions={showMeetingActions}
            meetingActionsCount={meetingActionsCount}
            showRecordings={showRecordings}
            notifications={notifications}
            unreadCount={unread}
          />
          <div className="topnav-content">{children}</div>
        </div>
        <CommandPalette />
        <Purii tour={tourForView(view)} canBypass={user.isAdmin} />
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
          navBadges={navBadges}
        />
        <main className="content" style={{ padding: 0 }}>
          {adminBar}
          <Topbar eyebrow={EYEBROW[view] ?? "Console"} notifications={notifications} unreadCount={unread} />
          <div className="content-pad">{children}</div>
        </main>
      </div>
      <CommandPalette />
      <Purii tour={tourForView(view)} canBypass={user.isAdmin} />
    </>
  );
}
