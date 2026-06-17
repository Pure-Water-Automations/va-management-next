import type { Role } from "@prisma/client";
import type { ConsoleView } from "@/lib/auth/roles";

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
      ],
    },
  ],
};

export function Sidebar({
  view,
  role,
  name,
  isAdmin = false,
}: {
  view: ConsoleView;
  role: Role;
  name: string;
  isAdmin?: boolean;
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
            <a key={item.href} href={item.href} className="nav-item" data-tour={item.href}>
              {item.label}
            </a>
          ))}
        </div>
      ))}
      {/* Senior VAs land in the VA console but can delegate/manage tasks and view
          projects (spec §2), so surface those entry points here. */}
      {role === "SENIOR_VA" && (
        <div>
          <div className="nav-label">Delegation</div>
          <a href="/hr/tasks" className="nav-item" data-tour="/hr/tasks">
            All Tasks
          </a>
          <a href="/hr/tasks/new" className="nav-item" data-tour="/hr/tasks/new">
            Delegate
          </a>
          <a href="/hr/projects" className="nav-item" data-tour="/hr/projects">
            Projects
          </a>
        </div>
      )}
      {/* Recordings (Loom-style) — admin-only preview. Opens to all roles later. */}
      {isAdmin && (
        <div>
          <div className="nav-label">Recordings</div>
          <a href="/record" className="nav-item" data-tour="/record">
            Record
          </a>
          <a href="/recordings" className="nav-item" data-tour="/recordings">
            Recordings
          </a>
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
