import type { ReactNode } from "react";
import type { Role } from "@prisma/client";
import type { ConsoleView } from "@/lib/auth/roles";
import { isFeatureNew } from "@/lib/new-features";
import { NavItemLink } from "./NavItemLink";
import { NavGroup } from "./NavGroup";
import { Avatar } from "./Avatar";
import {
  IconDashboard,
  IconAward,
  IconClipboardCheck,
  IconAlertTriangle,
  IconUsers,
  IconWallet,
  IconCalendarCheck,
  IconFileText,
  IconMail,
  IconListChecks,
  IconBarChart,
  IconUserPlus,
  IconGraduationCap,
  IconShieldCheck,
  IconBuilding,
  IconMessageSquare,
  IconHandshake,
  IconBriefcase,
  IconVideo,
  IconFilm,
  IconDollar,
  IconArchive,
  IconLogOut,
} from "./icons";

type NavItem = { href: string; label: string; icon: ReactNode; isNew?: boolean };

const NAV: Record<string, { label: string; items: NavItem[] }[]> = {
  ADMIN: [
    {
      // The Admin console — every admin-only surface lives here (and nowhere else).
      // Only all-access users (admin / Tester) ever land in this view.
      label: "Settings",
      items: [
        { href: "/admin/contract", label: "Contract template", icon: <IconFileText /> },
        { href: "/admin/client-agreement", label: "Client agreement", icon: <IconFileText /> },
        { href: "/admin/email", label: "Email sender", icon: <IconMail /> },
        { href: "/admin/users", label: "Users", icon: <IconUsers /> },
        { href: "/admin/mcp-tokens", label: "MCP Tokens", icon: <IconShieldCheck />, isNew: true },
      ],
    },
  ],
  HR: [
    {
      label: "Daily",
      items: [
        { href: "/hr", label: "Dashboard", icon: <IconDashboard /> },
        { href: "/hr/reviews", label: "Tier Reviews", icon: <IconAward /> },
        { href: "/hr/evaluations", label: "Evaluations", icon: <IconClipboardCheck /> },
        { href: "/hr/capacity", label: "Capacity Alerts", icon: <IconAlertTriangle /> },
      ],
    },
    {
      // People-ops only. Delegation (Projects/Tasks/Templates) is tier-driven and
      // lives in the VA console; app config moved to the admin-only Settings group.
      // Workload stays here read-only for capacity oversight.
      label: "Manage",
      items: [
        { href: "/hr/registry", label: "VA Registry", icon: <IconUsers /> },
        { href: "/hr/roles", label: "Compensation Roles", icon: <IconWallet /> },
        { href: "/hr/checkins", label: "Forms & Check-ins", icon: <IconCalendarCheck /> },
        { href: "/hr/workload", label: "Workload", icon: <IconBarChart /> },
        { href: "/recruitment/onboarding", label: "Onboarding", icon: <IconClipboardCheck /> },
      ],
    },
  ],
  PAYROLL: [
    {
      label: "Payroll",
      items: [
        { href: "/payroll", label: "Active Period", icon: <IconDollar /> },
        { href: "/payroll/archive", label: "Archive", icon: <IconArchive /> },
      ],
    },
  ],
  RECRUITMENT: [
    {
      // The recruiter owns the full funnel (consolidated out of HR).
      label: "Recruitment",
      items: [
        { href: "/recruitment", label: "Pipeline", icon: <IconUserPlus /> },
        { href: "/recruitment/training", label: "Training Log", icon: <IconGraduationCap /> },
        { href: "/recruitment/gate", label: "Gate Review", icon: <IconShieldCheck /> },
        { href: "/recruitment/tasks", label: "Training Module", icon: <IconListChecks /> },
      ],
    },
  ],
  SALES: [
    {
      label: "Sales",
      items: [
        { href: "/sales", label: "Pipeline", icon: <IconBriefcase />, isNew: true },
        { href: "/sales/calendar", label: "Calendar", icon: <IconCalendarCheck />, isNew: true },
      ],
    },
    {
      // Client management moved here from HR.
      label: "Clients",
      items: [
        { href: "/hr/client-onboarding", label: "Onboarding", icon: <IconHandshake />, isNew: true },
        { href: "/hr/clients", label: "Organizations", icon: <IconBuilding />, isNew: true },
        { href: "/hr/requests", label: "Client Requests", icon: <IconMessageSquare />, isNew: true },
      ],
    },
  ],
};

const SUBTITLE: Record<string, string> = {
  ADMIN: "Administration",
  HR: "HR Operations",
  PAYROLL: "Payroll",
  RECRUITMENT: "Recruitment",
  SALES: "Sales",
  VA: "My Console",
};

export function Sidebar({
  view,
  role,
  name,
  showMeetingActions = false,
  meetingActionsCount = 0,
  showRecordings = false,
}: {
  view: ConsoleView;
  role: Role;
  name: string;
  showMeetingActions?: boolean;
  meetingActionsCount?: number;
  showRecordings?: boolean;
}) {
  const sections = NAV[view] ?? NAV.HR;
  const showNew = isFeatureNew();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo-mark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/pwa-logo.png" alt="Pure Water Automations" />
        </span>
        <span className="brand-text">
          <span className="brand-name">Pure Water</span>
          <span className="brand-sub">{SUBTITLE[view] ?? "Console"}</span>
        </span>
      </div>

      <nav>
        {sections.map((section) => (
          <NavGroup key={section.label} label={section.label}>
            {section.items.map((item) => (
              <NavItemLink key={item.href} href={item.href} label={item.label} icon={item.icon} isNew={item.isNew && showNew} />
            ))}
          </NavGroup>
        ))}

        {/* Meeting Actions — Zoom transcript → tasks queue. Tier-driven (senior-tier
            VAs) + all-access; specialized roles (incl. HR) no longer review these.
            (Admin-only config still lives in the dedicated Admin view.) */}
        {showMeetingActions && (
          <NavGroup label="Meetings">
            <NavItemLink href="/meeting-actions" label="Meeting Actions" badge={meetingActionsCount} icon={<IconMessageSquare />} isNew={showNew} />
          </NavGroup>
        )}

        {/* Recordings — gated by isRecordingsVisible() (linked VA, gate-reviewer
            role, or all-access), same permission check across every console. */}
        {showRecordings && (
          <NavGroup label="Recordings">
            <NavItemLink href="/record" label="Record" icon={<IconVideo />} isNew={showNew} />
            <NavItemLink href="/recordings" label="Recordings" icon={<IconFilm />} isNew={showNew} />
          </NavGroup>
        )}
      </nav>

      <div className="foot">
        <Avatar name={name} size={34} />
        <div className="foot-meta">
          <div className="foot-name">{name}</div>
          <div className="foot-role">{role.replace(/_/g, " ")}</div>
        </div>
        <a href="/api/logout" title="Sign out" aria-label="Sign out" style={{ display: "flex", flex: "none", color: "rgba(255,255,255,.6)" }}>
          <IconLogOut size={16} />
        </a>
      </div>
    </aside>
  );
}
