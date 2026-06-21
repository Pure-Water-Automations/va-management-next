"use client";
import { usePathname } from "next/navigation";

export function NavItemLink({ href, label, badge }: { href: string; label: string; badge?: number }) {
  const pathname = usePathname();
  // Exact match for leaf pages; prefix match for paths with meaningful sub-pages
  // (/hr/projects/[id], /hr/tasks/[id]) but not for the bare /hr or /va roots.
  const isActive =
    pathname === href ||
    (href.split("/").length > 2 && pathname.startsWith(href + "/"));
  return (
    <a
      href={href}
      className={`nav-item${isActive ? " active" : ""}`}
      data-tour={href}
      style={badge && badge > 0 ? { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 } : undefined}
    >
      <span>{label}</span>
      {badge && badge > 0 ? (
        <span style={{ background: "var(--color-warning)", color: "#000", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: "var(--radius-badge)", lineHeight: "1.4" }}>
          {badge}
        </span>
      ) : null}
    </a>
  );
}
