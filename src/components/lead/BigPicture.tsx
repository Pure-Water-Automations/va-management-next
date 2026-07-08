"use client";

import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useMemo } from "react";
import { BAR_GRADIENTS, GradientAvatar, ProgressBar, StatCard, StatGrid, cardStyle } from "@/components/sales/ui";
import { compactMoney } from "@/lib/sales/packages";
import { monthInfo, paceStatus, type PaceStatus } from "@/lib/sales/pace";
import type { LeadOverview } from "@/lib/reads/lead";

const PACE_FILL: Record<PaceStatus, string> = {
  Hit: BAR_GRADIENTS.green,
  "On track": BAR_GRADIENTS.sky,
  Behind: BAR_GRADIENTS.amber,
};

export function BigPicture({ data }: { data: LeadOverview }) {
  const { elapsed } = useMemo(() => monthInfo(), []);
  const maxCount = Math.max(1, ...data.funnel.map((f) => f.count));

  return (
    <div>
      <style
        dangerouslySetInnerHTML={{
          __html:
            ".lead-two-col{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(0,1fr);gap:18px;margin-bottom:18px}" +
            "@media (max-width:900px){.lead-two-col{grid-template-columns:1fr}}",
        }}
      />

      {/* Row 1 — KPI stat cards */}
      <StatGrid>
        <StatCard hero label="Monthly recurring" value={compactMoney(data.kpis.mrr)} sub={`target ${compactMoney(data.kpis.mrrTarget)}`} />
        <StatCard label="Open pipeline" value={compactMoney(data.kpis.openPipeline)} sub="across all deals" />
        <StatCard label={`Won in ${data.monthName}`} value={String(data.kpis.won)} sub="new clients" />
        <StatCard label={`New leads in ${data.monthName}`} value={String(data.kpis.newLeads)} sub="all sources" />
      </StatGrid>

      {/* Row 2 — funnel + pinned targets */}
      <div className="lead-two-col">
        <div style={cardStyle}>
          <CardTitle>Pipeline right now</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 14 }}>
            {data.funnel.map((f) => {
              const width = Math.max(6, Math.round((f.count / maxCount) * 100));
              return (
                <div key={f.label} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 84, fontSize: 13, fontWeight: 600, color: "var(--color-navy-900, #132272)", flex: "none" }}>
                    {f.label}
                  </div>
                  <div style={{ flex: 1, height: 10, borderRadius: 999, background: "var(--color-bg-tertiary, #e8e8ed)", overflow: "hidden" }}>
                    <div
                      style={{
                        height: "100%",
                        width: `${width}%`,
                        borderRadius: 999,
                        background: f.won ? "var(--color-success, #30c97a)" : BAR_GRADIENTS.funnel,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                  <div style={{ width: 24, textAlign: "right", fontSize: 13, fontWeight: 700, flex: "none" }}>{f.count}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <CardTitle>{data.monthName} targets</CardTitle>
            <Link href="/lead/targets" style={linkStyle}>
              Set targets →
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            {data.pinned.map((t) => {
              const status = paceStatus(t.actual, t.target, elapsed);
              const pct = t.target > 0 ? t.actual / t.target : 0;
              return (
                <div key={t.id}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{t.label}</span>
                    <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{t.line}</span>
                  </div>
                  <ProgressBar pct={pct} height={7} fill={PACE_FILL[status]} />
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Row 3 — alerts + team mini roster */}
      <div className="lead-two-col">
        <div
          style={{
            ...cardStyle,
            background: "linear-gradient(150deg, #eef0fa 0%, #e7f8fd 100%)",
            border: "1px solid var(--color-sky-100, #c4eef9)",
          }}
        >
          <CardTitle>Needs a nudge</CardTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 14 }}>
            {data.alerts.length === 0 ? (
              <div style={{ fontSize: 13.5, color: "var(--color-text-secondary)" }}>All clear — nothing needs a nudge.</div>
            ) : (
              data.alerts.map((a) => (
                <Link key={a.href + a.label} href={a.href} style={alertRow}>
                  <span style={alertBadge}>{a.count}</span>
                  <span style={{ fontSize: 13.5, color: "var(--color-navy-900, #132272)" }}>{a.label}</span>
                  <span style={{ marginLeft: "auto", color: "var(--color-sky-600, #1e97be)", fontWeight: 700 }}>→</span>
                </Link>
              ))
            )}
          </div>
        </div>

        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
            <CardTitle>Team</CardTitle>
            <Link href="/lead/team" style={linkStyle}>
              See the team →
            </Link>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 14 }}>
            {data.team.map((m) => (
              <div key={m.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <GradientAvatar name={m.name} size={30} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {m.name} <span style={{ color: "var(--color-text-tertiary)", fontWeight: 500 }}>· {m.role}</span>
                  </div>
                  <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>{m.summary}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function CardTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: "var(--color-navy-900, #132272)" }}>
      {children}
    </div>
  );
}

const linkStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: "var(--color-sky-600, #1e97be)",
  textDecoration: "none",
  whiteSpace: "nowrap",
};

const alertRow: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 12,
  background: "rgba(255,255,255,0.75)",
  textDecoration: "none",
};

const alertBadge: CSSProperties = {
  width: 26,
  height: 26,
  borderRadius: 999,
  background: "var(--color-navy-900, #0f1c5e)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  flex: "none",
};
