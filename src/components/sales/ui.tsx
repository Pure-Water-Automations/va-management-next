"use client";

import type { CSSProperties, ReactNode } from "react";

// Shared UI atoms for the Sales & Marketing console screens (follow-ups,
// client accounts, marketing, leadership). Kanban-specific pieces stay in
// SalesBoard; these are the chips/cards/bars every other screen shares.

// ── Chips ────────────────────────────────────────────────────────────────

const chipBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  borderRadius: 9999,
  fontSize: 11,
  fontWeight: 700,
  padding: "2px 9px",
  whiteSpace: "nowrap",
};

export function Chip({ bg, fg, dot, children, style }: { bg: string; fg: string; dot?: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={{ ...chipBase, background: bg, color: fg, ...style }}>
      {dot ? <span style={{ width: 6, height: 6, borderRadius: 999, background: dot, flex: "none" }} /> : null}
      {children}
    </span>
  );
}

/** Follow-up / interaction kind chip. */
export function KindChip({ kind }: { kind: string }) {
  const map: Record<string, [string, string]> = {
    call: ["#e7f8fd", "#157ba0"],
    email: ["#d5daf4", "#22359e"],
    "check-in": ["#d4f5e2", "#1a7a4a"],
    checkin: ["#d4f5e2", "#1a7a4a"],
    proposal: ["#fff3d4", "#966200"],
    payment: ["#fde8e8", "#a01a1a"],
    note: ["#e8e8ed", "#48484a"],
  };
  const [bg, fg] = map[kind] ?? map.note;
  return <Chip bg={bg} fg={fg}>{kind}</Chip>;
}

/** Client health chip. */
export function HealthChip({ health }: { health: string }) {
  const map: Record<string, [string, string, string]> = {
    good: ["#d4f5e2", "#1a7a4a", "Healthy"],
    growing: ["#c4eef9", "#0d5e7e", "Growing"],
    watch: ["#fff3d4", "#966200", "Needs attention"],
    new: ["#d5daf4", "#22359e", "Onboarding"],
  };
  const [bg, fg, label] = map[health] ?? map.new;
  return <Chip bg={bg} fg={fg}>{label}</Chip>;
}

/** Goal / generic status chip (Not started / In progress / On track / At risk / Done…). */
export function StatusChip({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    "Not started": ["#e8e8ed", "#48484a"],
    "In progress": ["#c4eef9", "#0d5e7e"],
    "On track": ["#d4f5e2", "#1a7a4a"],
    "At risk": ["#fff3d4", "#966200"],
    Done: ["#d4f5e2", "#1a7a4a"],
    Hit: ["#d4f5e2", "#1a7a4a"],
    Behind: ["#fff3d4", "#966200"],
  };
  const [bg, fg] = map[status] ?? ["#e8e8ed", "#48484a"];
  return <Chip bg={bg} fg={fg}>{status}</Chip>;
}

// ── Avatars ──────────────────────────────────────────────────────────────

/** Deterministic gradient from a name (the design's avatar recipe). */
export function gradientFor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `linear-gradient(150deg, hsl(${h} 70% 62%), hsl(${(h + 40) % 360} 64% 42%))`;
}

export function initialsOf(name: string): string {
  return name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

export function GradientAvatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: gradientFor(name),
        color: "#fff",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: Math.max(10, Math.round(size * 0.38)),
        fontWeight: 700,
        flex: "none",
      }}
      title={name}
    >
      {initialsOf(name)}
    </span>
  );
}

// ── Progress bars ────────────────────────────────────────────────────────

export const BAR_GRADIENTS = {
  sky: "linear-gradient(90deg, #4dc4e8, #2ab0d8)",
  green: "linear-gradient(90deg, #30c97a, #1a7a4a)",
  amber: "linear-gradient(90deg, #ffb340, #ef9f27)",
  funnel: "linear-gradient(90deg, #6278d5, #4dc4e8)",
} as const;

/** Bar fill per paceStatus() verdict (lib/sales/pace.ts). */
export const PACE_FILL: Record<"Hit" | "On track" | "Behind", string> = {
  Hit: BAR_GRADIENTS.green,
  "On track": BAR_GRADIENTS.sky,
  Behind: BAR_GRADIENTS.amber,
};

export function ProgressBar({ pct, fill = BAR_GRADIENTS.sky, height = 8 }: { pct: number; fill?: string; height?: number }) {
  return (
    <div style={{ height, borderRadius: 999, background: "var(--color-bg-tertiary, #e8e8ed)", overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${Math.min(100, Math.max(0, pct * 100))}%`, background: fill, borderRadius: 999, transition: "width 0.4s ease" }} />
    </div>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────

export const cardStyle: CSSProperties = {
  background: "var(--color-surface, #fff)",
  border: "1px solid var(--color-border-subtle, #e8e8ed)",
  borderRadius: 16,
  padding: 18,
};

/** KPI stat card; `hero` renders the navy-gradient variant. */
export function StatCard({ label, value, sub, hero = false, onClick, active = false }: {
  label: string;
  value: ReactNode;
  sub?: string;
  hero?: boolean;
  onClick?: () => void;
  active?: boolean;
}) {
  const base: CSSProperties = {
    ...cardStyle,
    padding: "16px 18px",
    cursor: onClick ? "pointer" : undefined,
    ...(hero
      ? { background: "linear-gradient(168deg, #1a278a, #132272)", color: "#fff", border: "none" }
      : {}),
    ...(active ? { boxShadow: "0 0 0 2px var(--color-sky-400, #4dc4e8)" } : {}),
  };
  return (
    <div style={base} onClick={onClick} role={onClick ? "button" : undefined}>
      <div style={{ fontSize: 13, opacity: hero ? 0.85 : undefined, color: hero ? undefined : "var(--color-text-secondary)" }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "var(--font-display)", margin: "2px 0" }}>{value}</div>
      {sub ? <div style={{ fontSize: 12, opacity: hero ? 0.7 : undefined, color: hero ? undefined : "var(--color-text-tertiary)" }}>{sub}</div> : null}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 18 }}>{children}</div>;
}

// ── API helper ───────────────────────────────────────────────────────────

/**
 * POST a console op. Never rejects — network failures and bad responses both
 * resolve to { ok: false, error }, so callers' `!res.ok` rollback paths always
 * run (an optimistic update must never survive a dead request).
 */
export function postJson(url: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then((r) => r.json())
    .catch(() => ({ ok: false, error: "Network error — please try again." }));
}

// ── Toast ────────────────────────────────────────────────────────────────

import { useCallback, useState } from "react";

export function useToast(): [ReactNode, (msg: string) => void] {
  const [msg, setMsg] = useState<string | null>(null);
  const show = useCallback((m: string) => {
    setMsg(m);
    window.setTimeout(() => setMsg((cur) => (cur === m ? null : cur)), 2600);
  }, []);
  const node = msg ? (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        left: "50%",
        transform: "translateX(-50%)",
        background: "var(--color-navy-900, #0f1c5e)",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        padding: "10px 18px",
        borderRadius: 9999,
        boxShadow: "0 8px 24px rgba(15,28,94,0.35)",
        zIndex: 200,
        animation: "toastIn 0.22s ease",
      }}
    >
      {msg}
    </div>
  ) : null;
  return [node, show];
}
