import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getCurrentUser, getEffectiveView, getEffectiveVaId, isFounder, isBetaOn, isAllAccess, isCeo } from "@/lib/auth/access";
import { canUserDelegateTasks, canVaDelegateTasks, canUserReviewMeetingActions, canVaReviewMeetingActions } from "@/lib/auth/delegation";
import { db } from "@/lib/db";
import { getNotifications } from "@/lib/inbox";
import { logPageView } from "@/lib/pageview";
import { Sidebar } from "@/components/Sidebar";
import { Topbar } from "@/components/Topbar";
import { VaTopNav } from "@/components/VaTopNav";
import { AdminBar } from "@/components/AdminBar";
import { CommandPalette } from "@/components/CommandPalette";
import { DemoBanner } from "@/components/DemoBanner";
import { Purii } from "@/components/Purii";
import { tourForView } from "@/lib/purii";

const EYEBROW: Record<string, string> = {
  ADMIN: "Administration",
  HR: "HR Operations",
  PAYROLL: "Payroll",
  RECRUITMENT: "Recruitment",
  SALES: "Sales",
  VA: "My Console",
};

// A VA's console pill shows their TIER (seniority), not their role — "Senior VA" is
// Tier 3, "Lead VA" is Tier 4. Non-VA logins fall back to a humanized role.
const VA_TIER_LABEL: Record<string, string> = {
  TRAINEE: "Trainee",
  TIER_1: "Tier 1 VA",
  TIER_2: "Tier 2 VA",
  TIER_3: "Senior VA",
  TIER_4: "Lead VA",
};
function humanizeRole(role: string): string {
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

  const path = (await headers()).get("x-pathname") ?? "";
  await logPageView({ path, userId: user.id, vaId: user.vaId, role: user.role, view });
  let adminVas: { vaId: string; name: string }[] = [];
  let impersonatedVaId: string | null = null;
  if (isAllAccess(user)) {
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
  // Delegation + meeting-actions authority are comp-tier-driven (a senior-tier VA, or
  // any tier flagged on the Compensation Roles screen), so the VA-console nav follows
  // the tier, not the role. When an all-access user uses "View as → a VA", reflect the
  // IMPERSONATED VA's own authority so the preview matches what that VA actually sees.
  let canDelegate: boolean;
  let showMeetingActions: boolean;
  // When an all-access user is previewing "as VA", the top-nav pill should read as the
  // VA they're impersonating (their tier), not the admin's own role — otherwise the
  // preview is misleading. Populated in the impersonation branch below.
  let impersonatedRoleLabel: string | null = null;
  if (isAllAccess(user) && view === "VA" && impersonatedVaId && impersonatedVaId !== user.vaId) {
    // Map the impersonated VA → its login by EMAIL (Va.email is unique and matches
    // User.email). Keying on User.vaId is unreliable — some logins aren't linked to
    // their VA row (e.g. Aira), which would wrongly hide the Delegation nav.
    const impVa = await db.va.findUnique({
      where: { vaId: impersonatedVaId },
      select: { email: true, compensationRole: true },
    });
    if (impVa) impersonatedRoleLabel = VA_TIER_LABEL[impVa.compensationRole] ?? "Virtual Assistant";
    const impUser = impVa?.email
      ? await db.user.findUnique({ where: { email: impVa.email.toLowerCase() }, select: { id: true, role: true } })
      : null;
    // If the impersonated VA has a linked login, use its full authority; otherwise
    // (many VAs have no User account yet) judge straight from the VA's comp tier so
    // the preview still reflects what that tier grants.
    if (impUser) {
      canDelegate = await canUserDelegateTasks(impUser.id, impUser.role);
      showMeetingActions = await canUserReviewMeetingActions(impUser.id, impUser.role);
    } else {
      canDelegate = await canVaDelegateTasks(impersonatedVaId);
      showMeetingActions = await canVaReviewMeetingActions(impersonatedVaId);
    }
  } else {
    canDelegate = user.caps.manageTasks;
    showMeetingActions = user.caps.reviewMeetingActions;
  }

  // Recordings + all app config now live in the dedicated Admin view (NAV.ADMIN),
  // reachable only by all-access users — so no per-view recordings flag is needed.
  const showCeo = isCeo(user.email);
  const betaOn = await isBetaOn();
  const notifications = await getNotifications(user.id);
  const unread = notifications.filter((n) => !n.read).length;
  const meetingActionsCount = showMeetingActions
    ? await db.meetingAction.count({ where: { status: "PENDING", items: { some: { status: "PENDING" } } } })
    : 0;

  // Sales nav badge: follow-ups due today or overdue.
  let navBadges: Record<string, number> = {};
  if (view === "SALES") {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const followupsDue = await db.salesFollowUp.count({ where: { doneAt: null, due: { lte: endOfToday } } });
    navBadges = { "/sales/followups": followupsDue };
  }

  const userName = user.name ?? user.email;
  const roleLabel =
    impersonatedRoleLabel ??
    (user.va ? (VA_TIER_LABEL[user.va.compensationRole] ?? "Virtual Assistant") : humanizeRole(user.role));
  const adminBar = isAllAccess(user) ? (
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
        <DemoBanner />
        <div style={{ minHeight: "100vh", background: "var(--color-bg-secondary)" }}>
          {adminBar}
          <VaTopNav
            name={userName}
            photoSrc={user.va?.photoKey ? `/api/people/photo/${user.va.vaId}?v=${user.va.updatedAt.getTime()}` : null}
            roleLabel={roleLabel}
            canDelegate={canDelegate}
            showMeetingActions={showMeetingActions}
            meetingActionsCount={meetingActionsCount}
            notifications={notifications}
            unreadCount={unread}
          />
          <div className="topnav-content">{children}</div>
        </div>
        <CommandPalette />
        <Purii tour={tourForView(view)} canBypass={isAllAccess(user)} />
      </>
    );
  }

  // HR / Payroll / Recruitment: collapsible navy sidebar + glass top bar.
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: COLLAPSE_INIT }} />
      <DemoBanner />
      {/* Mobile nav: hamburger toggles the sidebar drawer (CSS-only). */}
      <input type="checkbox" id="nav-toggle" className="nav-toggle-cb" aria-hidden="true" defaultChecked={false} />
      <label htmlFor="nav-toggle" className="nav-burger" aria-label="Toggle menu">☰</label>
      <div className="app-shell">
        <label htmlFor="nav-toggle" className="nav-backdrop" aria-hidden="true" />
        <Sidebar
          view={view}
          role={user.role}
          name={userName}
          navBadges={navBadges}
          showMeetingActions={showMeetingActions}
          meetingActionsCount={meetingActionsCount}
          showCeo={showCeo}
        />
        <main className="content" style={{ padding: 0 }}>
          {adminBar}
          <Topbar eyebrow={EYEBROW[view] ?? "Console"} notifications={notifications} unreadCount={unread} />
          <div className="content-pad">{children}</div>
        </main>
      </div>
      <CommandPalette />
      <Purii tour={tourForView(view)} canBypass={isAllAccess(user)} />
    </>
  );
}
