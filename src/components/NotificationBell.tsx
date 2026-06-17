"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";

type NotificationItem = {
  id: string;
  type: string;
  body: string;
  link: string | null;
  read: boolean;
  createdAt: Date | string;
};

function shortDate(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const sec = Math.round(diffMs / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (sec < 60) return "just now";
  if (min < 60) return `${min}m ago`;
  if (hr < 24) return `${hr}h ago`;
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationItem[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const sorted = [...notifications].sort((a, b) => {
    const ta = (a.createdAt instanceof Date ? a.createdAt : new Date(a.createdAt)).getTime();
    const tb = (b.createdAt instanceof Date ? b.createdAt : new Date(b.createdAt)).getTime();
    return tb - ta;
  });

  async function openNotification(n: NotificationItem) {
    await postAction("/api/notifications/read", { id: n.id });
    if (n.link) {
      window.location.href = n.link;
    } else {
      setOpen(false);
      router.refresh();
    }
  }

  async function markAll() {
    setBusy(true);
    await postAction("/api/notifications/read-all", {});
    setBusy(false);
    router.refresh();
  }

  return (
    <div ref={rootRef} style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        aria-label="Notifications"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{
          position: "relative",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          height: 36,
          padding: 0,
          fontSize: 18,
          lineHeight: 1,
          cursor: "pointer",
          background: "transparent",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          color: "var(--color-text)",
        }}
      >
        <span aria-hidden="true">🔔</span>
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 10,
              fontWeight: 700,
              lineHeight: 1,
              color: "#fff",
              background: "var(--color-danger, #dc2626)",
              borderRadius: 999,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            width: 320,
            maxHeight: 420,
            display: "flex",
            flexDirection: "column",
            background: "var(--color-surface, var(--color-bg, #fff))",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
            zIndex: 50,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 12px",
              borderBottom: "1px solid var(--color-border)",
            }}
          >
            <span style={{ fontWeight: 600, fontSize: 14, color: "var(--color-text)" }}>
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAll}
                disabled={busy}
                style={{
                  background: "transparent",
                  border: "none",
                  padding: 0,
                  fontSize: 12,
                  cursor: busy ? "default" : "pointer",
                  color: "var(--color-primary, #2563eb)",
                  opacity: busy ? 0.6 : 1,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          <div style={{ overflowY: "auto", flex: 1 }}>
            {sorted.length === 0 ? (
              <div
                style={{
                  padding: "24px 12px",
                  textAlign: "center",
                  fontSize: 13,
                  color: "var(--color-text-muted, #6b7280)",
                }}
              >
                No notifications
              </div>
            ) : (
              sorted.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  role="menuitem"
                  onClick={() => openNotification(n)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 8,
                    padding: "10px 12px",
                    textAlign: "left",
                    background: n.read ? "transparent" : "var(--color-bg-subtle, rgba(37,99,235,0.06))",
                    border: "none",
                    borderBottom: "1px solid var(--color-border)",
                    cursor: "pointer",
                    color: "var(--color-text)",
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      flex: "0 0 auto",
                      width: 8,
                      height: 8,
                      marginTop: 5,
                      borderRadius: 999,
                      background: n.read ? "transparent" : "var(--color-primary, #2563eb)",
                    }}
                  />
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span
                      style={{
                        display: "block",
                        fontSize: 13,
                        lineHeight: 1.35,
                        color: "var(--color-text)",
                      }}
                    >
                      {n.body}
                    </span>
                    <span
                      style={{
                        display: "block",
                        marginTop: 2,
                        fontSize: 11,
                        color: "var(--color-text-muted, #6b7280)",
                      }}
                    >
                      {shortDate(n.createdAt)}
                    </span>
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
