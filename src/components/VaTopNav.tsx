"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Avatar } from "./Avatar";
import { NotificationBell } from "./NotificationBell";
import {
  IconDashboard,
  IconAward,
  IconClipboardCheck,
  IconCalendarCheck,
  IconListChecks,
  IconInbox,
  IconSend,
  IconFolder,
  IconMessageSquare,
  IconVideo,
  IconFilm,
  IconLogOut,
} from "./icons";

type Item = { href: string; label: string; icon: ReactNode; badge?: number };
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

  const items: Item[] = [
    { href: "/va", label: "Overview", icon: <IconDashboard /> },
    { href: "/va/tasks", label: "My Tasks", icon: <IconListChecks /> },
    { href: "/hr/tasks/available", label: "Available", icon: <IconInbox /> },
    { href: "/va/tier", label: "Tier", icon: <IconAward /> },
    { href: "/va/evaluation", label: "Evaluation", icon: <IconClipboardCheck /> },
    { href: "/va/checkin", label: "Check-in", icon: <IconCalendarCheck /> },
  ];
  if (canDelegate) {
    items.push(
      { href: "/hr/tasks", label: "All Tasks", icon: <IconListChecks /> },
      { href: "/hr/tasks/new", label: "Delegate", icon: <IconSend /> },
      { href: "/hr/projects", label: "Projects", icon: <IconFolder /> },
    );
  }
  if (showMeetingActions) {
    items.push({ href: "/meeting-actions", label: "Meetings", icon: <IconMessageSquare />, badge: meetingActionsCount });
  }
  if (showRecordings) {
    items.push(
      { href: "/record", label: "Record", icon: <IconVideo /> },
      { href: "/recordings", label: "Recordings", icon: <IconFilm /> },
    );
  }

  return (
    <header className="topnav">
      <div className="topnav-inner">
        <a href="/va" className="brand">
          <span className="logo-mark">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pwa-logo.png" alt="Pure Water Automations" />
          </span>
          <span className="brand-name">
            Pure Water <span className="dot">·</span> VA
          </span>
        </a>
        <nav className="topnav-links">
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className={`topnav-item${isActivePath(pathname, item.href) ? " active" : ""}`}
            >
              <span className="nav-icon">{item.icon}</span>
              {item.label}
              {item.badge && item.badge > 0 ? <span className="nav-badge">{item.badge}</span> : null}
            </a>
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
