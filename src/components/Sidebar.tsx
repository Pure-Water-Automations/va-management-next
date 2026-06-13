import type { Role } from "@prisma/client";
import { viewForRole } from "@/lib/auth/roles";

type NavItem = { href: string; label: string };

const NAV: Record<string, { label: string; items: NavItem[] }[]> = {
  HR: [
    {
      label: "Daily",
      items: [
        { href: "/hr", label: "Dashboard" },
        { href: "/hr/reviews", label: "Tier Reviews" },
        { href: "/hr/capacity", label: "Capacity Alerts" },
      ],
    },
    {
      label: "Manage",
      items: [
        { href: "/hr/registry", label: "VA Registry" },
        { href: "/hr/roles", label: "Compensation Roles" },
        { href: "/hr/checkins", label: "Forms & Check-ins" },
      ],
    },
    {
      label: "Recruitment",
      items: [
        { href: "/recruitment", label: "Pipeline" },
        { href: "/recruitment/training", label: "Training Log" },
        { href: "/recruitment/gate", label: "Gate Review" },
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
        { href: "/va/checkin", label: "Monthly Check-in" },
      ],
    },
  ],
};

export function Sidebar({ role, name }: { role: Role; name: string }) {
  const view = viewForRole(role);
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
            <a key={item.href} href={item.href} className="nav-item">
              {item.label}
            </a>
          ))}
        </div>
      ))}
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
