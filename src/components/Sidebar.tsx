import type { Role } from "@prisma/client";
import type { ConsoleView } from "@/lib/auth/roles";
import { NavItemLink } from "./NavItemLink";

type NavItem = { href: string; label: string };

const NAV: Record<string, { label: string; items: NavItem[] }[]> = {
  HR: [
    {
      label: "Daily",
      items: [
        { href: "/hr", label: "Dashboard" },
        { href: "/hr/reviews", label: "Tier Reviews" },
        { href: "/hr/evaluations", label: "Evaluations" },
        { href: "/hr/capacity", label: "Capacity Alerts" },
      ],
    },
    {
      label: "Manage",
      items: [
        { href: "/hr/registry", label: "VA Registry" },
        { href: "/hr/roles", label: "Compensation Roles" },
        { href: "/hr/checkins", label: "Forms & Check-ins" },
        { href: "/admin/contract", label: "Contract template" },
        { href: "/admin/email", label: "Email sender" },
      ],
    },
    {
      label: "Projects",
      items: [
        { href: "/hr/projects", label: "Projects" },
        { href: "/hr/tasks", label: "All Tasks" },
        { href: "/hr/tasks/available", label: "Available" },
        { href: "/hr/tasks/new", label: "Delegate" },
        { href: "/hr/workload", label: "Workload" },
        { href: "/hr/templates", label: "Templates" },
      ],
    },
    {
      label: "Recruitment",
      items: [
        { href: "/recruitment", label: "Pipeline" },
        { href: "/recruitment/training", label: "Training Log" },
        { href: "/recruitment/gate", label: "Gate Review" },
        { href: "/recruitment/tasks", label: "Training Module" },
        { href: "/recruitment/onboarding", label: "Onboarding" },
      ],
    },
  ],
  PAYROLL: [
    {
      label: "Payroll",
      items: [
        { href: "/payroll", label: "Active Period" },
        { href: "/payroll/archive", label: "Archive" },
      ],
    },
  ],
  RECRUITMENT: [
    {
      label: "Recruitment",
      items: [
        { href: "/recruitment", label: "Pipeline" },
        { href: "/recruitment/training", label: "Training Log" },
      ],
    },
  ],
  VA: [
    {
      label: "My Console",
      items: [
        { href: "/va", label: "Overview" },
        { href: "/va/tier", label: "Tier Progress" },
        { href: "/va/evaluation", label: "Evaluation" },
        { href: "/va/checkin", label: "Monthly Check-in" },
        { href: "/va/tasks", label: "My Tasks" },
        { href: "/hr/tasks/available", label: "Available Tasks" },
      ],
    },
  ],
};

export function Sidebar({
  view,
  role,
  name,
  isAdmin = false,
  showBeta = false,
  canDelegate = false,
}: {
  view: ConsoleView;
  role: Role;
  name: string;
  isAdmin?: boolean;
  showBeta?: boolean;
  canDelegate?: boolean;
}) {
  const sections = NAV[view] ?? NAV.VA;
  return (
    <aside className="sidebar">
      <div className="brand">
        PWA<span className="dot">.</span>
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 400, opacity: 0.7 }}>VA Ops</span>
      </div>
      {sections.map((section) => (
        <div key={section.label}>
          <div className="nav-label">{section.label}</div>
          {section.items.map((item) => (
            <NavItemLink key={item.href} href={item.href} label={item.label} />
          ))}
        </div>
      ))}
      {/* HR managers and people ops can manage clients and client requests */}
      {view === "HR" && (role === "HR_MANAGER" || role === "PEOPLE_OPS" || isAdmin) && (
        <div>
          <div className="nav-label">Clients</div>
          <NavItemLink href="/hr/clients" label="Organizations" />
          <NavItemLink href="/hr/requests" label="Client Requests" />
        </div>
      )}
      {/* VA-console users with delegation authority (a Senior VA, or any tier flagged
          "Can delegate" on the Compensation Roles screen) get the delegation entry points. */}
      {view === "VA" && canDelegate && (
        <div>
          <div className="nav-label">Delegation</div>
          <NavItemLink href="/hr/tasks" label="All Tasks" />
          <NavItemLink href="/hr/tasks/new" label="Delegate" />
          <NavItemLink href="/hr/projects" label="Projects" />
        </div>
      )}
      {isAdmin && (
        <div>
          <div className="nav-label">Admin</div>
          <NavItemLink href="/admin/users" label="Users" />
        </div>
      )}
      {/* Recordings (Loom-style) — beta, founder-only preview (hidden when the
          founder toggles beta off). Opens to more roles later. */}
      {showBeta && (
        <div>
          <div className="nav-label">Recordings</div>
          <NavItemLink href="/record" label="Record" />
          <NavItemLink href="/recordings" label="Recordings" />
        </div>
      )}
      <div className="foot">
        {name}
        <br />
        {role.replace(/_/g, " ")}
        <br />
        <a href="/api/logout" style={{ color: "var(--color-sky-300)" }}>
          Sign out
        </a>
      </div>
    </aside>
  );
}
