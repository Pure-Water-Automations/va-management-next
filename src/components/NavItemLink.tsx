"use client";
import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

/** Closes the CSS-only mobile drawer after a client-side nav (which, unlike a
 *  full page reload, doesn't reset the #nav-toggle checkbox on its own). */
function closeMobileDrawer() {
  const cb = document.getElementById("nav-toggle") as HTMLInputElement | null;
  if (cb) cb.checked = false;
}

export function NavItemLink({
  href,
  label,
  badge,
  tag,
  icon,
}: {
  href: string;
  label: string;
  badge?: number;
  tag?: string; // text pill, e.g. "new" on Library (OS Hub design)
  icon?: ReactNode;
}) {
  const pathname = usePathname();
  // Exact match for leaf pages; prefix match for paths with meaningful sub-pages
  // (/hr/projects/[id], /hr/tasks/[id]) but not for the bare /hr or /va roots.
  const isActive =
    pathname === href ||
    (href.split("/").length > 2 && pathname.startsWith(href + "/"));
  // Client-side navigation keeps the persistent layout (and the sidebar's own
  // scroll position) mounted, instead of a full reload that resets it.
  return (
    <Link
      href={href}
      className={`nav-item${isActive ? " active" : ""}`}
      data-tour={href}
      title={label}
      onClick={closeMobileDrawer}
    >
      {icon ? <span className="nav-icon">{icon}</span> : null}
      <span className="nav-text">{label}</span>
      {badge && badge > 0 ? <span className="nav-badge">{badge}</span> : null}
      {tag ? <span className="nav-badge">{tag}</span> : null}
    </Link>
  );
}
