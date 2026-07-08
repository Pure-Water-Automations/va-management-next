"use client";

import { postJson } from "@/components/sales/ui";
import { useEffect, type CSSProperties, type ReactNode } from "react";
import { Chip } from "@/components/sales/ui";

// Shared client-side primitives for the Marketing console screens: chip color
// maps, buttons, the right-side drawer shell, the API call helper, and small
// date/value formatters. Screen-specific layout stays in each client.

// ── API helper ───────────────────────────────────────────────────────────

export function callMarketing(body: Record<string, unknown>): Promise<{ ok: boolean; result?: unknown; error?: string }> {
  return postJson("/api/marketing", body);
}

// ── Chip color maps ──────────────────────────────────────────────────────

/** Content-type chips (also the calendar legend). */
export const TYPE_CHIPS: Record<string, [string, string]> = {
  social: ["#d5daf4", "#22359e"],
  email: ["#c4eef9", "#0d5e7e"],
  video: ["#f9e0ea", "#b03b66"],
  doc: ["#d4f5e2", "#1a7a4a"],
  event: ["#fff3d4", "#966200"],
};

export function TypeChip({ type }: { type: string }) {
  const [bg, fg] = TYPE_CHIPS[type] ?? TYPE_CHIPS.social;
  return <Chip bg={bg} fg={fg}>{type}</Chip>;
}

/** Social platform chips. */
export const PLATFORM_CHIPS: Record<string, [string, string]> = {
  FB: ["#d5daf4", "#22359e"],
  IG: ["#f9e0ea", "#b03b66"],
  YT: ["#fde8e8", "#a32d2d"],
  LI: ["#c4eef9", "#0d5e7e"],
};

export function PlatformChip({ platform }: { platform: string }) {
  const [bg, fg] = PLATFORM_CHIPS[platform] ?? ["#e8e8ed", "#48484a"];
  return <Chip bg={bg} fg={fg}>{platform}</Chip>;
}

/** Social post status chips. */
export const SOCIAL_STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  approval: { bg: "#fff3d4", fg: "#966200", label: "Needs approval" },
  scheduled: { bg: "#c4eef9", fg: "#0d5e7e", label: "Scheduled" },
  posted: { bg: "#d4f5e2", fg: "#1a7a4a", label: "Posted" },
  draft: { bg: "#e8e8ed", fg: "#48484a", label: "Draft" },
  production: { bg: "#e8e8ed", fg: "#48484a", label: "In production" },
};

export function SocialStatusChip({ status }: { status: string }) {
  const s = SOCIAL_STATUS[status] ?? SOCIAL_STATUS.draft;
  return <Chip bg={s.bg} fg={s.fg}>{s.label}</Chip>;
}

/** Campaign status chips. */
export const CAMPAIGN_STATUS: Record<string, { bg: string; fg: string; label: string }> = {
  active: { bg: "#d4f5e2", fg: "#1a7a4a", label: "Active" },
  planning: { bg: "#fff3d4", fg: "#966200", label: "Planning" },
  draft: { bg: "#e8e8ed", fg: "#48484a", label: "Draft" },
};

export function CampaignStatusChip({ status }: { status: string }) {
  const s = CAMPAIGN_STATUS[status] ?? CAMPAIGN_STATUS.draft;
  return <Chip bg={s.bg} fg={s.fg}>{s.label}</Chip>;
}

export function ChannelChip({ channel }: { channel: string }) {
  return <Chip bg="#e7f8fd" fg="#157ba0">{channel}</Chip>;
}

// ── Deal stage dots / labels (shared with the sales pipeline) ────────────

export const STAGE_LABEL: Record<string, string> = {
  new: "New", discovery_scheduled: "Discovery scheduled", discovery_completed: "Discovery completed",
  proposal_needed: "Proposal needed", proposal_sent: "Proposal sent", negotiation: "Negotiation",
  verbal_yes: "Verbal yes", won: "Won", lost: "Lost", nurture: "Nurture", no_show: "No-show",
};

export const STAGE_DOT: Record<string, string> = {
  new: "#378add", discovery_scheduled: "#2ab0d8", discovery_completed: "#1d9e75",
  proposal_needed: "#ba7517", proposal_sent: "#ef9f27", negotiation: "#d4537e",
  verbal_yes: "#639922", won: "#30c97a", lost: "#a32d2d", nurture: "#7c7c82", no_show: "#a32d2d",
};

// ── Buttons ──────────────────────────────────────────────────────────────

export const solidBtn: CSSProperties = {
  background: "var(--color-navy-900, #132272)",
  color: "#fff",
  border: "none",
  borderRadius: 9999,
  padding: "6px 13px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const ghostBtn: CSSProperties = {
  background: "var(--color-surface, #fff)",
  color: "var(--color-navy-900, #132272)",
  border: "1px solid var(--color-border, #d2d2d7)",
  borderRadius: 9999,
  padding: "6px 13px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  whiteSpace: "nowrap",
};

export const inputStyle: CSSProperties = {
  border: "1px solid var(--color-border, #d2d2d7)",
  borderRadius: 10,
  padding: "7px 11px",
  fontSize: 13,
  fontFamily: "inherit",
  background: "var(--color-surface, #fff)",
  color: "var(--color-text-primary, #1d1d1f)",
};

// ── Drawer shell ─────────────────────────────────────────────────────────

export function Drawer({ title, onClose, width = "min(560px, 92vw)", titleSize = 21, children }: {
  title: ReactNode;
  onClose: () => void;
  width?: string;
  titleSize?: number;
  children: ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(13,29,95,0.35)", zIndex: 90 }} />
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width,
          background: "var(--color-surface, #fff)",
          zIndex: 95,
          padding: "24px 28px",
          overflowY: "auto",
          boxShadow: "-18px 0 44px rgba(15,28,94,0.18)",
          animation: "drawerIn 0.25s ease",
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
          <h2 style={{ margin: 0, fontSize: titleSize, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--color-navy-900, #132272)", letterSpacing: "-0.02em" }}>
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ border: "none", background: "transparent", fontSize: 22, lineHeight: 1, cursor: "pointer", color: "var(--color-text-tertiary, #98989d)", padding: 2 }}
          >
            ×
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}

// ── Formatters ───────────────────────────────────────────────────────────

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function monthNameLong(month: number): string {
  return MONTHS_LONG[month] ?? "";
}

/** "Jul 7" from an ISO date string. */
export function fmtDayLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
}

/** "July 8, 2026" from an ISO date string. */
export function fmtFullDate(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Schedule label: "Jul 7, 5:00 PM" (date only when midnight); null → "Not scheduled". */
export function fmtWhen(iso: string | null): string {
  if (!iso) return "Not scheduled";
  const d = new Date(iso);
  const day = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  if (d.getHours() === 0 && d.getMinutes() === 0) return day;
  let h = d.getHours() % 12;
  if (h === 0) h = 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}, ${h}:${mm} ${d.getHours() < 12 ? "AM" : "PM"}`;
}

/** Per-deal value chip: $800/mo · $90/hr · $500 · null. */
export function dealValueLabel(value: number | null, billing: string | null): string | null {
  if (value == null) return null;
  const v = `$${value.toLocaleString()}`;
  if (billing === "retainer") return `${v}/mo`;
  if (billing === "hourly") return `${v}/hr`;
  return v;
}
