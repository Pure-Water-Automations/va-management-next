"use client";
import { usePathname } from "next/navigation";

export function NavItemLink({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  // Exact match for leaf pages; prefix match for paths with meaningful sub-pages
  // (/hr/projects/[id], /hr/tasks/[id]) but not for the bare /hr or /va roots.
  const isActive =
    pathname === href ||
    (href.split("/").length > 2 && pathname.startsWith(href + "/"));
  return (
    <a href={href} className={`nav-item${isActive ? " active" : ""}`} data-tour={href}>
      {label}
    </a>
  );
}
