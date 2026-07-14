import type { ReactNode } from "react";
import type { Role } from "@prisma/client";
import type { ConsoleView } from "@/lib/auth/roles";
import { humanRole } from "@/lib/labels";
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
  IconFolder,
  IconListChecks,
  IconInbox,
  IconBarChart,
  IconTemplate,
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

type NavItem = { href: string; label: string; icon: ReactNode };

const NAV: Record<string, { label: string; items: NavItem[] }[]> = {
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
      label: "Manage",
      items: [
        { href: "/hr/registry", label: "VA Registry", icon: <IconUsers /> },
        { href: "/hr/roles", label: "Compensation Roles", icon: <IconWallet /> },
        { href: "/hr/checkins", label: "Forms & Check-ins", icon: <IconCalendarCheck /> },
      ],
    },
    {
      label: "Projects",
      items: [
        { href: "/hr/projects", label: "Projects", icon: <IconFolder /> },
        { href: "/hr/tasks", label: "All Tasks", icon: <IconListChecks /> },
        { href: "/hr/tasks/available", label: "Available", icon: <IconInbox /> },
        { href: "/hr/workload", label: "Workload", icon: <IconBarChart /> },
        { href: "/hr/templates", label: "Templates", icon: <IconTemplate /> },
      ],
    },
    {
      label: "Recruitment",
      items: [
        { href: "/recruitment", label: "Pipeline", icon: <IconUserPlus /> },
        { href: "/recruitment/training", label: "Training Log", icon: <IconGraduationCap /> },
        { href: "/recruitment/gate", label: "Gate Review", icon: <IconShieldCheck /> },
        { href: "/recruitment/tasks", label: "Training Module", icon: <IconListChecks /> },
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
      label: "Recruitment",
      items: [
        { href: "/recruitment", label: "Pipeline", icon: <IconUserPlus /> },
        { href: "/recruitment/training", label: "Training Log", icon: <IconGraduationCap /> },
      ],
    },
  ],
};

const SUBTITLE: Record<string, string> = {
  HR: "HR Operations",
  PAYROLL: "Payroll",
  RECRUITMENT: "Recruitment",
  VA: "My Console",
};

export function Sidebar({
  view,
  role,
  name,
  isAdmin = false,
  showRecordings = false,
  showMeetingActions = false,
  meetingActionsCount = 0,
}: {
  view: ConsoleView;
  role: Role;
  name: string;
  isAdmin?: boolean;
  showRecordings?: boolean;
  showMeetingActions?: boolean;
  meetingActionsCount?: number;
}) {
  const sections = NAV[view] ?? NAV.HR;
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
              <NavItemLink key={item.href} href={item.href} label={item.label} icon={item.icon} />
            ))}
          </NavGroup>
        ))}

        {/* HR managers and people ops can manage clients and client requests */}
        {view === "HR" && (role === "HR_MANAGER" || role === "PEOPLE_OPS" || isAdmin) && (
          <NavGroup label="Clients">
            <NavItemLink href="/hr/sales" label="Sales Pipeline" icon={<IconBriefcase />} />
            <NavItemLink href="/hr/client-onboarding" label="Onboarding" icon={<IconHandshake />} />
            <NavItemLink href="/hr/clients" label="Organizations" icon={<IconBuilding />} />
            <NavItemLink href="/hr/requests" label="Client Requests" icon={<IconMessageSquare />} />
          </NavGroup>
        )}

        {/* Meeting Actions — Zoom transcript → tasks queue. Shown to task
            reviewers (HR Manager / Team Lead / Senior VA). */}
        {showMeetingActions && (
          <NavGroup label="Meetings">
            <NavItemLink href="/meeting-actions" label="Meeting Actions" badge={meetingActionsCount} icon={<IconMessageSquare />} />
          </NavGroup>
        )}

        {/* Admin-only tools — the target pages redirect non-admins, so they live
            here behind the isAdmin gate (not in the shared HR "Manage" group). */}
        {isAdmin && (
          <NavGroup label="Admin">
            <NavItemLink href="/admin/users" label="Users" icon={<IconUsers />} />
            <NavItemLink href="/admin/contract" label="Contract template" icon={<IconFileText />} />
            <NavItemLink href="/admin/client-agreement" label="Client agreement" icon={<IconFileText />} />
            <NavItemLink href="/admin/email" label="Email sender" icon={<IconMail />} />
            <NavItemLink href="/admin/mcp-tokens" label="Delegation MCP" icon={<IconShieldCheck />} />
          </NavGroup>
        )}

        {/* Recordings (Loom-style recorder + library) — open to admins. */}
        {showRecordings && (
          <NavGroup label="Recordings">
            <NavItemLink href="/record" label="Record" icon={<IconVideo />} />
            <NavItemLink href="/recordings" label="Recordings" icon={<IconFilm />} />
          </NavGroup>
        )}
      </nav>

      <div className="foot">
        <Avatar name={name} size={34} />
        <div className="foot-meta">
          <div className="foot-name">{name}</div>
          <div className="foot-role">{humanRole(role)}</div>
        </div>
        <a href="/api/logout" title="Sign out" aria-label="Sign out" style={{ display: "flex", flex: "none", color: "rgba(255,255,255,.6)" }}>
          <IconLogOut size={16} />
        </a>
      </div>
    </aside>
  );
}
