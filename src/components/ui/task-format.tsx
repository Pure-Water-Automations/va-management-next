import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";

type BadgeVariant = "default" | "primary" | "sky" | "success" | "warning" | "danger" | "info" | "solid";

// ── Status / priority color mapping ─────────────────────────────────────────

export function taskStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "Done":
      return "success";
    case "InProgress":
      return "sky";
    case "Blocked":
      return "danger";
    case "NotStarted":
    default:
      return "default";
  }
}

export function projectStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case "Active":
      return "sky";
    case "Done":
      return "success";
    case "Paused":
      return "warning";
    case "Planning":
    default:
      return "default";
  }
}

export function priorityVariant(priority: string): BadgeVariant {
  switch (priority) {
    case "High":
      return "danger";
    case "Medium":
      return "warning";
    case "Low":
    default:
      return "default";
  }
}

function humanizeStatus(s: string): string {
  // "NotStarted" -> "Not Started", "InProgress" -> "In Progress"
  return s.replace(/([a-z])([A-Z])/g, "$1 $2");
}

/** Color-coded status pill. kind="task" | "project". */
export function StatusBadge({ value, kind = "task" }: { value: string; kind?: "task" | "project" }) {
  const variant = kind === "project" ? projectStatusVariant(value) : taskStatusVariant(value);
  return <Badge variant={variant}>{humanizeStatus(value)}</Badge>;
}

export function PriorityBadge({ value }: { value: string }) {
  return (
    <Badge variant={priorityVariant(value)} size="sm">
      {value}
    </Badge>
  );
}

// ── Due-date chip (overdue=red, soon=amber, future=muted) ────────────────────

const DAY = 24 * 60 * 60 * 1000;

export function DueChip({
  date,
  status,
  now = new Date(),
}: {
  date: Date | string | null | undefined;
  status?: string;
  now?: Date;
}) {
  if (!date) {
    return <span className="small" style={{ color: "var(--color-text-tertiary)" }}>No due date</span>;
  }
  const d = typeof date === "string" ? new Date(date) : date;
  const label = d.toLocaleDateString();
  // Completed tasks aren't "overdue" — show neutral.
  if (status === "Done") {
    return <span className="small" style={{ color: "var(--color-text-tertiary)" }}>Due {label}</span>;
  }
  const diff = d.getTime() - now.getTime();
  let color = "var(--color-text-secondary)";
  let prefix = "Due ";
  if (diff < 0) {
    color = "var(--color-error-dark)";
    prefix = "Overdue · ";
  } else if (diff <= 3 * DAY) {
    color = "var(--color-warning-dark)";
    prefix = "Due ";
  }
  return (
    <span className="small" style={{ color, fontWeight: diff <= 3 * DAY ? 600 : 400 }}>
      {prefix}
      {label}
    </span>
  );
}

// ── Assignee avatar (deterministic color from initials) ──────────────────────

const AVATAR_COLORS = [
  "var(--color-navy-800)",
  "var(--color-sky-500)",
  "#5b8def",
  "#7c5cbf",
  "#2fa37a",
  "#c2772f",
  "#b5495b",
];

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function hashIndex(s: string, mod: number): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % mod;
}

export function Avatar({
  name,
  email,
  size = 24,
}: {
  name?: string | null;
  email?: string | null;
  size?: number;
}) {
  const display = name?.trim() || email?.trim() || "?";
  const bg = AVATAR_COLORS[hashIndex(display, AVATAR_COLORS.length)];
  return (
    <span
      title={display}
      aria-label={display}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: "#fff",
        fontSize: Math.round(size * 0.42),
        fontWeight: 700,
        flexShrink: 0,
        lineHeight: 1,
      }}
    >
      {initials(display)}
    </span>
  );
}

/** Avatar + name inline. */
export function AssigneeChip({ name, email }: { name?: string | null; email?: string | null }) {
  const display = name?.trim() || email?.trim() || "Unassigned";
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Avatar name={name} email={email} size={22} />
      <span>{display}</span>
    </span>
  );
}

// ── Link chips (comma-separated URLs → clickable host chips) ─────────────────

function hostOf(raw: string): string {
  try {
    return new URL(raw.trim()).hostname.replace(/^www\./, "");
  } catch {
    return raw.trim();
  }
}

export function LinkChips({ links }: { links: string | null | undefined }) {
  if (!links) return null;
  const items = links
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length === 0) return null;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
      {items.map((url, i) => {
        const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
        return (
          <a
            key={`${url}-${i}`}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              padding: "2px 10px",
              borderRadius: 999,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-secondary)",
              fontSize: "var(--text-xs)",
              color: "var(--color-sky-700)",
              textDecoration: "none",
            }}
          >
            🔗 {hostOf(url)}
          </a>
        );
      })}
    </div>
  );
}

// ── Empty state with optional call-to-action ─────────────────────────────────

export function EmptyState({
  icon = "📋",
  title,
  hint,
  ctaHref,
  ctaLabel,
  children,
}: {
  icon?: string;
  title: string;
  hint?: string;
  ctaHref?: string;
  ctaLabel?: string;
  children?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 10,
        padding: "40px 24px",
        textAlign: "center",
        border: "1px dashed var(--color-border)",
        borderRadius: "var(--radius-input)",
        color: "var(--color-text-tertiary)",
      }}
    >
      <div style={{ fontSize: 32 }}>{icon}</div>
      <div style={{ fontWeight: 600, color: "var(--color-text-secondary)" }}>{title}</div>
      {hint && <div className="small">{hint}</div>}
      {ctaHref && ctaLabel && (
        <a href={ctaHref} className="btn btn-primary" style={{ marginTop: 4 }}>
          {ctaLabel}
        </a>
      )}
      {children}
    </div>
  );
}
