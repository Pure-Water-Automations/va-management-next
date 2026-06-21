"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

export function NavItemLink({
  href,
  label,
  badge,
  icon,
}: {
  href: string;
  label: string;
  badge?: number;
  icon?: ReactNode;
}) {
  const pathname = usePathname();
  // Exact match for leaf pages; prefix match for paths with meaningful sub-pages
  // (/hr/projects/[id], /hr/tasks/[id]) but not for the bare /hr or /va roots.
  const isActive =
    pathname === href ||
    (href.split("/").length > 2 && pathname.startsWith(href + "/"));
  return (
    <a href={href} className={`nav-item${isActive ? " active" : ""}`} data-tour={href} title={label}>
      {icon ? <span className="nav-icon">{icon}</span> : null}
      <span className="nav-text">{label}</span>
      {badge && badge > 0 ? <span className="nav-badge">{badge}</span> : null}
    </a>
  );
}
