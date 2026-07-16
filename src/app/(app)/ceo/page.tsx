import { redirect } from "next/navigation";
import { getCurrentUser, isCeo } from "@/lib/auth/access";
import { getLatestCfoSnapshot } from "@/lib/reads/cfo";
import { Stat } from "@/components/ui/Stat";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { Priority, Severity } from "@/lib/cfo/types";

export const dynamic = "force-dynamic";

const money = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n)
    ? n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
    : "—";
const pct = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? `${n.toFixed(1)}%` : "—";
const num = (n: number | null | undefined) =>
  typeof n === "number" && Number.isFinite(n) ? String(Math.round(n)) : "—";

const priorityVariant: Record<Priority, "danger" | "warning" | "info" | "default"> = {
  Critical: "danger",
  High: "warning",
  Medium: "info",
  Watch: "default",
};
const severityVariant: Record<Severity, "danger" | "warning" | "info"> = {
  Critical: "danger",
  High: "warning",
  Medium: "info",
};

// % change of revenue vs prior, as a signed label for the Stat trend.
function change(cur: number, prior: number): { change?: string; trend?: "up" | "down" | "neutral" } {
  if (!Number.isFinite(cur) || !Number.isFinite(prior) || prior === 0) return {};
  const delta = ((cur - prior) / Math.abs(prior)) * 100;
  return { change: `${delta >= 0 ? "+" : ""}${delta.toFixed(0)}%`, trend: delta > 0 ? "up" : delta < 0 ? "down" : "neutral" };
}

export default async function CeoView() {
  const user = await getCurrentUser();
  if (!isCeo(user.email)) redirect("/");

  const snap = await getLatestCfoSnapshot();

  if (!snap) {
    return (
      <>
        <div className="page-head">
          <div>
            <div className="crumb">Leadership</div>
            <h1>CEO / CFO view</h1>
          </div>
        </div>
        <Card>
          <div className="small">
            No CFO snapshot yet. Run a CFO review (say &ldquo;run CFO review&rdquo; in a Claude session) to
            populate this view, or wait for tonight&rsquo;s automated push.
          </div>
        </Card>
      </>
    );
  }

  const d = snap.payload.derived;
  const k = d.kpis;
  const ageMs = Date.now() - new Date(snap.payload.computed_at ?? snap.computedAt).getTime();
  const stale = ageMs > 48 * 60 * 60 * 1000;
  const computedLabel = new Date(snap.payload.computed_at ?? snap.computedAt).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Leadership</div>
          <h1>CEO / CFO view</h1>
        </div>
        <Badge variant={snap.hasNarrative ? "info" : "default"}>
          {snap.hasNarrative ? "Full review" : "Auto snapshot"} · data as of {computedLabel}
        </Badge>
      </div>

      {stale && (
        <Card variant="outline" style={{ marginBottom: 20, borderColor: "var(--color-warning, #b45309)" }}>
          <div className="small" style={{ color: "var(--color-warning, #b45309)" }}>
            ⚠ Data is over 48h old (as of {computedLabel}). Run a CFO review to refresh.
          </div>
        </Card>
      )}

      {/* Headline story */}
      {snap.payload.narrative && (
        <Card variant="navy" style={{ marginBottom: 24 }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-lg)", margin: "0 0 8px" }}>
            The story
          </h2>
          <p style={{ margin: 0, lineHeight: 1.6 }}>{snap.payload.narrative}</p>
        </Card>
      )}

      {/* Top decisions needed */}
      {snap.payload.actions.length > 0 && (
        <Card padding={0} style={{ overflow: "hidden", marginBottom: 24 }}>
          <SectionHead title="Decisions needed" />
          <div style={{ overflowX: "auto" }}>
            <table style={tbl}>
              <thead>
                <tr>{["Action", "Owner", "When", "Why"].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {snap.payload.actions.map((a, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: 600 }}>{a.action}</td>
                    <td style={td}>{a.owner}</td>
                    <td style={td}>{a.timeframe}</td>
                    <td style={{ ...td, color: "var(--color-text-tertiary)" }}>{a.rationale ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Executive KPIs */}
      <div className="stat-grid">
        <Stat label="Revenue (MTD)" value={money(k.revenue_mtd)} {...change(k.revenue_mtd, k.revenue_mtd_prior)} changeLabel="vs prior mo" variant="navy" />
        <Stat label="Gross margin" value={pct(k.gross_margin_pct)} />
        <Stat label="Cash on hand" value={money(k.cash_on_hand)} />
        <Stat label="DSO" value={k.dso_days == null ? "—" : num(k.dso_days)} unit="days" />
        <Stat label="Total A/R" value={money(k.total_ar)} />
      </div>

      {/* A/R aging */}
      <Card padding={0} style={{ overflow: "hidden", marginTop: 24 }}>
        <SectionHead title="A/R aging" />
        <div style={{ overflowX: "auto" }}>
          <table style={tbl}>
            <thead>
              <tr>{["Bucket", "Amount", "% of A/R"].map((h) => <th key={h} style={h === "Bucket" ? th : thNum}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {(d.ar_aging ?? []).map((b) => (
                <tr key={b.bucket}>
                  <td style={td}>{b.bucket}</td>
                  <td style={tdNum}>{money(b.amount)}</td>
                  <td style={tdNum}>{pct(b.pct_of_ar)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Overdue invoice monitor */}
      <Card padding={0} style={{ overflow: "hidden", marginTop: 24 }}>
        <SectionHead title="Overdue invoices" />
        <div style={{ overflowX: "auto" }}>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={th}>Invoice</th><th style={th}>Customer</th><th style={thNum}>Days over</th>
                <th style={thNum}>Balance</th><th style={th}>Priority</th>
              </tr>
            </thead>
            <tbody>
              {(d.overdue_invoices ?? []).map((inv) => (
                <tr key={inv.invoice_no}>
                  <td style={td}>{inv.invoice_no}</td>
                  <td style={td}>{inv.customer}</td>
                  <td style={tdNum}>{num(inv.days_overdue)}</td>
                  <td style={tdNum}>{money(inv.balance)}</td>
                  <td style={td}><Badge variant={priorityVariant[inv.priority] ?? "default"}>{inv.priority}</Badge></td>
                </tr>
              ))}
              {(d.overdue_invoices ?? []).length === 0 && <EmptyRow cols={5} label="No overdue invoices." />}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Customer risk */}
      <Card padding={0} style={{ overflow: "hidden", marginTop: 24 }}>
        <SectionHead
          title="Customer risk"
          right={d.concentration ? `Top customer ${pct(d.concentration.top1_pct)} · top 5 ${pct(d.concentration.top5_pct)}` : undefined}
        />
        <div style={{ overflowX: "auto" }}>
          <table style={tbl}>
            <thead>
              <tr>
                <th style={th}>Customer</th><th style={thNum}>Exposure</th><th style={thNum}>% of A/R</th>
                <th style={thNum}>Oldest</th><th style={th}>Flags</th>
              </tr>
            </thead>
            <tbody>
              {(d.customer_risk ?? []).map((c) => (
                <tr key={c.customer}>
                  <td style={td}>{c.customer}</td>
                  <td style={tdNum}>{money(c.exposure)}</td>
                  <td style={tdNum}>{pct(c.pct_of_ar)}</td>
                  <td style={tdNum}>{num(c.oldest_invoice_days)}d</td>
                  <td style={td}>
                    {(c.flags ?? []).length
                      ? c.flags.map((f) => <Badge key={f} variant="warning" size="sm" style={{ marginRight: 4 }}>{f}</Badge>)
                      : <span style={{ color: "var(--color-text-tertiary)" }}>—</span>}
                  </td>
                </tr>
              ))}
              {(d.customer_risk ?? []).length === 0 && <EmptyRow cols={5} label="No customer risk data." />}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, marginTop: 24 }} className="ceo-two-col">
        {/* Collection priorities */}
        <Card padding={0} style={{ overflow: "hidden" }}>
          <SectionHead title="Collection priorities" />
          <div style={{ overflowX: "auto" }}>
            <table style={tbl}>
              <thead>
                <tr><th style={th}>Customer</th><th style={thNum}>Amount</th><th style={th}>Action</th></tr>
              </thead>
              <tbody>
                {(d.collection_priorities ?? []).map((c, i) => (
                  <tr key={i}>
                    <td style={td}>{c.customer}</td>
                    <td style={tdNum}>{money(c.amount)}</td>
                    <td style={{ ...td, color: "var(--color-text-tertiary)" }}>{c.action}</td>
                  </tr>
                ))}
                {(d.collection_priorities ?? []).length === 0 && <EmptyRow cols={3} label="Nothing to chase." />}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Cash forecast */}
        <Card padding={0} style={{ overflow: "hidden" }}>
          <SectionHead title="Cash collection forecast" />
          <div style={{ overflowX: "auto" }}>
            <table style={tbl}>
              <thead>
                <tr><th style={th}>Horizon</th><th style={thNum}>Expected collection</th></tr>
              </thead>
              <tbody>
                {(d.cash_forecast ?? []).map((f) => (
                  <tr key={f.horizon_days}>
                    <td style={td}>Next {f.horizon_days} days</td>
                    <td style={tdNum}>{money(f.expected_collection)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Alerts */}
      <Card padding={0} style={{ overflow: "hidden", marginTop: 24 }}>
        <SectionHead title="Alerts" />
        {(d.alerts ?? []).length === 0 ? (
          <div style={{ padding: 20, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No active alerts.</div>
        ) : (
          (d.alerts ?? []).map((a) => (
            <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid var(--color-border-subtle)" }}>
              <Badge variant={severityVariant[a.severity] ?? "info"} size="sm">{a.severity}</Badge>
              <span>{a.message}</span>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

function SectionHead({ title, right }: { title: string; right?: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: 0 }}>{title}</h2>
      {right && <span className="small" style={{ color: "var(--color-text-tertiary)" }}>{right}</span>}
    </div>
  );
}

function EmptyRow({ cols, label }: { cols: number; label: string }) {
  return (
    <tr>
      <td style={{ ...td, fontStyle: "italic", color: "var(--color-text-tertiary)" }} colSpan={cols}>{label}</td>
    </tr>
  );
}

const tbl: React.CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "var(--text-sm)" };
const th: React.CSSProperties = {
  textAlign: "left", padding: "10px 16px", fontSize: "var(--text-xs)", textTransform: "uppercase",
  letterSpacing: "0.1em", color: "var(--color-text-tertiary)", borderBottom: "1px solid var(--color-border)", whiteSpace: "nowrap",
};
const thNum: React.CSSProperties = { ...th, textAlign: "right" };
const td: React.CSSProperties = { padding: "11px 16px", borderBottom: "1px solid var(--color-border-subtle)", whiteSpace: "nowrap" };
const tdNum: React.CSSProperties = { ...td, textAlign: "right", fontFamily: "var(--font-mono)" };
