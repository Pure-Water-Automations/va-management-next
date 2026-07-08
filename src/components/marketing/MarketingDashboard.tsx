"use client";

import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";
import { StatCard, StatGrid, cardStyle } from "@/components/sales/ui";
import { compactMoney } from "@/lib/sales/packages";
import type { MarketingDashboardData } from "@/lib/reads/marketing";
import { TypeChip, fmtDayLabel, solidBtn } from "@/components/marketing/common";

// Per-source bar fill colors; unknown tags cycle the fallback palette.
const SOURCE_COLORS: Record<string, string> = {
  discover: "#4dc4e8",
  "fb-pastors": "#4059c7",
  referral: "#30c97a",
  newsletter: "#ffb340",
  "kea-event": "#d4537e",
};
const FALLBACK_COLORS = ["#6278d5", "#2ab0d8", "#ef9f27", "#d4537e", "#1d9e75"];

const sectionTitle: CSSProperties = {
  fontSize: 19,
  fontWeight: 700,
  fontFamily: "var(--font-display)",
  color: "var(--color-navy-900, #132272)",
  letterSpacing: "-0.02em",
  margin: 0,
};

export function MarketingDashboard({ data }: { data: MarketingDashboardData }) {
  const router = useRouter();
  const maxCount = Math.max(1, ...data.sources.map((s) => s.count));

  return (
    <div>
      {/* Row 1 — KPI cards */}
      <StatGrid>
        <StatCard hero label={`New leads in ${data.monthLabel}`} value={data.newLeadsThisMonth} sub="from marketing sources" />
        <StatCard label="Discover-form leads" value={data.discoverTotal} sub={`${data.discoverThisMonth} new in ${data.monthLabel}`} />
        <StatCard label="Active campaigns" value={data.activeCampaigns} sub="running right now" />
        <StatCard label="Open pipeline value" value={compactMoney(data.openMarketingPipeline)} sub="sourced by marketing" />
      </StatGrid>

      {/* Row 2 — lead sources + due this week */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 18 }}>
        <div style={cardStyle}>
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, marginBottom: 14 }}>
            <h2 style={sectionTitle}>Lead sources</h2>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary, #98989d)" }}>shared with sales</span>
          </div>
          {data.sources.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary, #98989d)" }}>No campaigns yet — create one to start attributing leads.</div>
          )}
          {data.sources.map((s, i) => (
            <div
              key={s.tag}
              onClick={() => router.push(`/marketing/campaigns?campaign=${s.campaignId}`)}
              title="Open this campaign"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 10px", borderRadius: 10, cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-sky-50, #e7f8fd)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ width: 190, flex: "none", fontSize: 13, fontWeight: 600, color: "var(--color-navy-900, #132272)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.label}
              </span>
              <span style={{ flex: 1, height: 8, borderRadius: 9999, background: "#e8e8ed", overflow: "hidden" }}>
                <span style={{ display: "block", height: "100%", borderRadius: 9999, width: `${(s.count / maxCount) * 100}%`, background: SOURCE_COLORS[s.tag] ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length] }} />
              </span>
              <span style={{ width: 24, flex: "none", textAlign: "right", fontSize: 13, fontWeight: 700, color: "var(--color-navy-900, #132272)" }}>{s.count}</span>
              <span style={{ width: 110, flex: "none", fontSize: 11.5, color: "var(--color-text-tertiary, #98989d)" }}>
                {s.won > 0 ? `${s.won} won` : "—"}
                {s.open > 0 ? ` · ${compactMoney(s.open)} open` : ""}
              </span>
            </div>
          ))}
        </div>

        <div style={cardStyle}>
          <h2 style={{ ...sectionTitle, marginBottom: 14 }}>Due this week</h2>
          {data.dueThisWeek.length === 0 && (
            <div style={{ fontSize: 13, color: "var(--color-text-tertiary, #98989d)" }}>Nothing due this week.</div>
          )}
          {data.dueThisWeek.map((item) => (
            <div
              key={item.id}
              onClick={() => router.push(`/marketing/content?content=${item.id}`)}
              style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", borderRadius: 10, cursor: "pointer" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-sky-50, #e7f8fd)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ marginTop: 1 }}><TypeChip type={item.type} /></span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontSize: 13, fontWeight: 600, color: "var(--color-text-primary, #1d1d1f)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {item.title}
                </span>
                <span style={{ display: "block", fontSize: 12, color: "var(--color-text-tertiary, #98989d)" }}>
                  {fmtDayLabel(item.dateISO)} · {item.status === "inprogress" ? "in progress" : item.status}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Row 3 — handoff cards */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 18 }}>
        <HandoffCard
          title="Nurture leads → Nurture drip"
          count={data.nurtureOrgs.length}
          detail={data.nurtureOrgs.length ? data.nurtureOrgs.join(" · ") : "None right now"}
          button="Open Email Planner"
          onClick={() => router.push("/marketing/email")}
        />
        <HandoffCard
          title="Won clients → testimonial requests"
          count={data.toRequestOrgs.length}
          detail={data.toRequestOrgs.length ? data.toRequestOrgs.join(" · ") : "None waiting"}
          button="Open Testimonials"
          onClick={() => router.push("/marketing/testimonials")}
        />
      </div>
    </div>
  );
}

function HandoffCard({ title, count, detail, button, onClick }: {
  title: string;
  count: number;
  detail: string;
  button: string;
  onClick: () => void;
}) {
  return (
    <div
      style={{
        background: "linear-gradient(150deg, #eef0fa, #e7f8fd)",
        border: "1px solid var(--color-sky-100, #d3f1fa)",
        borderRadius: 16,
        padding: 18,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-navy-900, #132272)" }}>{title}</div>
      <div style={{ fontSize: 30, fontWeight: 700, fontFamily: "var(--font-display)", color: "var(--color-navy-900, #132272)" }}>{count}</div>
      <div style={{ fontSize: 12.5, color: "var(--color-text-secondary, #6e6e73)" }}>{detail}</div>
      <div style={{ marginTop: 4 }}>
        <button type="button" style={solidBtn} onClick={onClick}>{button}</button>
      </div>
    </div>
  );
}
