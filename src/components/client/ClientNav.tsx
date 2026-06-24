"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconDashboard, IconFolder, IconMessageSquare, IconFilm, IconSettings } from "@/components/icons";

const LINKS = [
  { href: "/client", label: "Dashboard", exact: true, icon: <IconDashboard /> },
  { href: "/client/projects", label: "Projects", icon: <IconFolder /> },
  { href: "/client/requests", label: "Requests", icon: <IconMessageSquare /> },
  { href: "/client/recordings", label: "Videos", icon: <IconFilm /> },
];

export function ClientNav({ showSettings = false }: { showSettings?: boolean }) {
  const pathname = usePathname();
  const links = showSettings
    ? [...LINKS, { href: "/client/settings", label: "Settings", icon: <IconSettings /> }]
    : LINKS;
  return (
    <nav className="topnav-links">
      {links.map((l) => {
        const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={`topnav-item${active ? " active" : ""}`}>
            <span className="nav-icon">{l.icon}</span>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
