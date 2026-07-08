"use client";

import Link from "next/link";
import type { CSSProperties } from "react";
import { GradientAvatar, cardStyle } from "@/components/sales/ui";
import type { TeamMember } from "@/lib/reads/lead";

export function TeamClient({ members }: { members: TeamMember[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 14 }}>
      {members.map((m) => (
        <div key={m.key} style={{ ...cardStyle, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <GradientAvatar name={m.name} size={44} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 600, color: "var(--color-navy-900, #132272)" }}>
                {m.name}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{m.role}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {m.stats.map((s) => (
              <div key={s.label} style={tile}>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 19,
                    fontWeight: 700,
                    color: s.warn ? "var(--color-warning-dark, #966200)" : "var(--color-navy-900, #132272)",
                  }}
                >
                  {s.value}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--color-text-tertiary)" }}>{s.label}</div>
              </div>
            ))}
          </div>

          <Link href={m.console === "sales" ? "/sales" : "/marketing"} style={ghostBtn}>
            {m.console === "sales" ? "Open the sales console" : "Open the marketing console"}
          </Link>
        </div>
      ))}
    </div>
  );
}

const tile: CSSProperties = {
  background: "var(--color-bg-secondary, #f5f5f7)",
  borderRadius: 12,
  padding: "12px 14px",
};

const ghostBtn: CSSProperties = {
  display: "block",
  textAlign: "center",
  border: "1px solid var(--color-border, #d2d2d7)",
  borderRadius: 9999,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 600,
  color: "var(--color-navy-900, #132272)",
  textDecoration: "none",
  background: "var(--color-surface, #fff)",
};
