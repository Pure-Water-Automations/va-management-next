"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { isFeatureNew } from "@/lib/new-features";
import { useHorizontalWheelScroll } from "@/lib/hooks/useHorizontalWheelScroll";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import {
  IconDashboard,
  IconAward,
  IconCalendarCheck,
  IconListChecks,
  IconInbox,
  IconFolder,
  IconBarChart,
  IconMessageSquare,
  IconVideo,
  IconFilm,
  IconLogOut,
} from "./icons";

type Item = { href: string; label: string; icon: ReactNode; badge?: number; isNew?: boolean };
type NotificationItem = Parameters<typeof NotificationBell>[0]["notifications"][number];

function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || (href.split("/").length > 2 && pathname.startsWith(href + "/"));
}

export function VaTopNav({
  name,
  roleLabel,
  canDelegate = false,
  showMeetingActions = false,
  meetingActionsCount = 0,
  showRecordings = false,
  notifications,
  unreadCount,
}: {
  name: string;
  roleLabel: string;
  canDelegate?: boolean;
  showMeetingActions?: boolean;
  meetingActionsCount?: number;
  showRecordings?: boolean;
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  const pathname = usePathname();
  const navRef = useHorizontalWheelScroll<HTMLElement>();
  const showNew = isFeatureNew();

  const items: Item[] = [
    { href: "/va", label: "Overview", icon: <IconDashboard /> },
    { href: "/va/tasks", label: "My Tasks", icon: <IconListChecks /> },
    { href: "/hr/tasks/available", label: "Available", icon: <IconInbox /> },
    { href: "/va/tier", label: "Tier", icon: <IconAward /> },
    { href: "/va/checkin", label: "Check-in", icon: <IconCalendarCheck /> },
  ];
  if (canDelegate) {
    // Delegating (senior-tier) VAs get the full delegation surface — All Tasks,
    // Projects, Workload. "Delegate" itself is reachable via the + Delegate Task
    // button on those pages, so no separate nav item.
    items.push(
      { href: "/hr/tasks", label: "All Tasks", icon: <IconListChecks /> },
      { href: "/hr/projects", label: "Projects", icon: <IconFolder /> },
      { href: "/hr/workload", label: "Workload", icon: <IconBarChart /> },
    );
  }
  if (showMeetingActions) {
    items.push({ href: "/meeting-actions", label: "Meetings", icon: <IconMessageSquare />, badge: meetingActionsCount, isNew: true });
  }
  if (showRecordings) {
    items.push(
      { href: "/record", label: "Record", icon: <IconVideo />, isNew: true },
      { href: "/recordings", label: "Recordings", icon: <IconFilm />, isNew: true },
    );
  }

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <Link href="/va" className="brand">
          <span className="logo-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pwa-logo.png" alt="Pure Water Automations" />
          </span>
          <span className="brand-name">
            Pure Water <span className="dot">·</span> VA
          </span>
        </Link>
        <nav className="topnav-links" ref={navRef}>
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`topnav-item${isActivePath(pathname, item.href) ? " active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              <span className="nav-label">{item.label}</span>
              {item.isNew && showNew ? <span className="nav-new-tag">New</span> : null}
              {item.badge && item.badge > 0 ? <span className="nav-badge">{item.badge}</span> : null}
            </Link>
          ))}
        </nav>
        <div className="topnav-end">
          <span className="role-pill">
            <span className="dot" />
            {roleLabel}
          </span>
          <NotificationBell notifications={notifications} unreadCount={unreadCount} />
          <Avatar name={name} size={34} />
          <a href="/api/logout" title="Sign out" aria-label="Sign out" className="icon-btn round" style={{ width: 34, height: 34 }}>
            <IconLogOut size={16} />
          </a>
        </div>
      </div>
    </header>
  );
}
