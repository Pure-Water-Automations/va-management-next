import { SidebarCollapseToggle } from "./SidebarCollapseToggle";
import { SearchPill } from "./SearchPill";
import { NotificationBell } from "./NotificationBell";

type NotificationItem = Parameters<typeof NotificationBell>[0]["notifications"][number];

/** Sticky glass header for the sidebar consoles (HR / Payroll / Recruitment). */
export function Topbar({
  eyebrow,
  notifications,
  unreadCount,
}: {
  eyebrow: string;
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  return (
    <header className="topbar">
      <div className="topbar-inner">
        <SidebarCollapseToggle />
        <span className="eyebrow">{eyebrow}</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <SearchPill placeholder="Search VAs, clients, tasks…" />
          <NotificationBell notifications={notifications} unreadCount={unreadCount} />
        </div>
      </div>
    </header>
  );
}
