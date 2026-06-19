"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/client", label: "Dashboard", exact: true },
  { href: "/client/projects", label: "Projects" },
  { href: "/client/requests", label: "Requests" },
];

export function ClientNav() {
  const pathname = usePathname();
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
      {LINKS.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            style={{
              fontSize: "var(--text-sm)",
              fontWeight: active ? "var(--weight-semibold)" : "var(--weight-medium)",
              color: active ? "var(--color-text-brand)" : "var(--color-text-secondary)",
              background: active ? "var(--color-sky-50)" : "transparent",
              padding: "var(--space-1-5) var(--space-3)",
              borderRadius: "var(--radius-nav)",
            }}
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
