"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Chip,
  KindChip,
  HealthChip,
  GradientAvatar,
  ProgressBar,
  BAR_GRADIENTS,
  cardStyle,
  StatCard,
  StatGrid,
  useToast, postJson } from "@/components/sales/ui";
import { pkgByName, nextPkgOf, compactMoney } from "@/lib/sales/packages";
import { ownerLabel } from "@/lib/sales/owners";
import type { ClientAccountRow, TimelineEntry } from "@/lib/reads/sales-console";

const call = (body: Record<string, unknown>) => postJson("/api/sales/console", body);

// ── date helpers ─────────────────────────────────────────────────────────

/** Whole local days since an ISO datetime. */
function daysSince(iso: string): number {
  const then = new Date(iso);
  const now = new Date();
  const a = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const b = new Date(then.getFullYear(), then.getMonth(), then.getDate()).getTime();
  return Math.max(0, Math.round((a - b) / 86400000));
}

function touchLabel(days: number): string {
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** "Jul 4" — for timeline entries; passes stored labels straight through. */
function shortDate(s: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s.length === 10 ? `${s}T12:00:00` : s);
    if (!Number.isNaN(d.getTime())) return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }
  return s;
}

function monthName(): string {
  return new Date().toLocaleDateString(undefined, { month: "long" });
}

// ── account derivations ──────────────────────────────────────────────────

function priceLabel(a: ClientAccountRow): string {
  if (a.pkg === "Hourly") return `$${pkgByName("Hourly")?.rate ?? 10}/hr`;
  return `$${a.price.toLocaleString()}/mo`;
}

/** hoursUsed / package hours for metered packages, else null. */
function usagePct(a: ClientAccountRow): number | null {
  const hours = pkgByName(a.pkg)?.hours;
  if (!hours) return null;
  return a.hoursUsed / hours;
}

const AT_CEILING = 0.9;

type Action = { label: string; variant: "solid" | "ghost" | "ghost-sky"; run: () => void };

export function ClientAccountsClient({ accounts: initial, openAccountId = null }: { accounts: ClientAccountRow[]; openAccountId?: string | null }) {
  const router = useRouter();
  const [accounts, setAccounts] = useState<ClientAccountRow[]>(initial);
  const [drawer, setDrawer] = useState<{ id: string; preset: "checkin" | "note" | null } | null>(
    () => (openAccountId && initial.some((a) => a.id === openAccountId) ? { id: openAccountId, preset: null } : null),
  );
  const [toastNode, showToast] = useToast();

  const mrr = accounts.reduce((s, a) => s + a.price, 0);
  const upgradeSignals = accounts.filter((a) => (usagePct(a) ?? 0) >= AT_CEILING || a.upgradeDealId).length;
  const checkinsDue = accounts.filter((a) => a.checkinDue).length;

  const current = drawer ? accounts.find((a) => a.id === drawer.id) ?? null : null;

  async function startUpgrade(a: ClientAccountRow) {
    const res = await call({ op: "account_start_upgrade", id: a.id });
    const dealId = res.ok ? (res.result as { dealId?: string } | undefined)?.dealId : undefined;
    if (dealId) {
      setAccounts((p) => p.map((x) => (x.id === a.id ? { ...x, upgradeDealId: dealId } : x)));
      showToast("Upgrade deal created in the pipeline, follow-up added for tomorrow.");
    } else {
      showToast(res.error || "Failed to start the upgrade.");
    }
  }

  async function scheduleCheckin(a: ClientAccountRow) {
    const res = await call({ op: "account_checkin", id: a.id });
    if (res.ok) showToast("Check-in added to your follow-ups.");
    else showToast(res.error || "Failed to schedule.");
  }

  function logInteraction(a: ClientAccountRow, type: string, note: string): boolean {
    if (!note.trim()) { showToast("Write a quick note first."); return false; }
    const entry: TimelineEntry = { date: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }), type, note: note.trim() };
    setAccounts((p) =>
      p.map((x) =>
        x.id === a.id
          ? { ...x, timeline: [entry, ...x.timeline], lastTouch: new Date().toISOString(), checkinDue: type === "checkin" ? false : x.checkinDue }
          : x,
      ),
    );
    showToast("Logged — last touch updated.");
    void call({ op: "account_log", id: a.id, type, note: note.trim() }).then((res) => {
      if (!res.ok) { showToast(res.error || "Failed to save."); router.refresh(); }
    });
    return true;
  }

  /** The one next-action button per row (priority ladder from the spec). */
  function actionFor(a: ClientAccountRow): Action {
    const next = nextPkgOf(a.pkg);
    if (a.upgradeDealId) {
      const dealId = a.upgradeDealId;
      return { label: "Upgrade in pipeline →", variant: "ghost-sky", run: () => router.push(`/sales?deal=${dealId}`) };
    }
    if ((usagePct(a) ?? 0) >= AT_CEILING && next && next.price != null) {
      return { label: `Start ${next.name} upgrade`, variant: "solid", run: () => void startUpgrade(a) };
    }
    if (a.health === "watch" || a.checkinDue) {
      return { label: "Log check-in", variant: "solid", run: () => setDrawer({ id: a.id, preset: "checkin" }) };
    }
    if (a.health === "new") {
      return { label: "30-day check-in", variant: "ghost", run: () => setDrawer({ id: a.id, preset: "checkin" }) };
    }
    return { label: "Log a note", variant: "ghost", run: () => setDrawer({ id: a.id, preset: "note" }) };
  }

  return (
    <div>
      <StatGrid>
        <StatCard hero label="Monthly recurring" value={compactMoney(mrr)} sub="across all packages" />
        <StatCard label="Active clients" value={accounts.length} sub="organizations" />
        <StatCard label="Upgrade signals" value={upgradeSignals} sub="at their hours ceiling" />
        <StatCard label="Check-ins due" value={checkinsDue} sub="quiet for too long" />
      </StatGrid>

      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 960 }}>
          <div style={{ ...rowGrid, padding: "0 18px 8px", fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--color-text-tertiary,#98989d)" }}>
            <span>Client</span><span>Package</span><span>Hours</span><span>Health</span><span>Last touch</span><span style={{ textAlign: "right" }}>Next action</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {accounts.length === 0 && <p className="small" style={{ padding: "8px 18px" }}>No client accounts yet.</p>}
            {accounts.map((a) => {
              const action = actionFor(a);
              const pkg = pkgByName(a.pkg);
              const touchDays = daysSince(a.lastTouch);
              return (
                <div
                  key={a.id}
                  onClick={(e) => { if (e.target instanceof HTMLElement && e.target.closest("button")) return; setDrawer({ id: a.id, preset: null }); }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDrawer({ id: a.id, preset: null }); } }}
                  style={{ ...cardStyle, ...rowGrid, padding: "14px 18px", cursor: "pointer" }}
                >
                  <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <GradientAvatar name={ownerLabel(a.ownerEmail)} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontWeight: 600, fontSize: 14, color: "var(--color-navy-900,#132272)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.org}</span>
                      <span style={{ display: "block", fontSize: 12, color: "var(--color-text-secondary,#666)" }}>{a.contact}</span>
                    </span>
                  </span>
                  <span>
                    <span style={pkgPill}>{a.pkg}</span>
                    <span style={{ display: "block", fontSize: 12, color: "var(--color-text-tertiary,#98989d)", marginTop: 3 }}>{priceLabel(a)}</span>
                  </span>
                  <span style={{ fontSize: 13, color: "var(--color-text-secondary,#666)" }}>
                    {pkg?.hours ? `${Math.round(a.hoursUsed)} / ${pkg.hours} hrs` : `${Math.round(a.hoursUsed)} hrs in ${monthName()}`}
                  </span>
                  <span><HealthChip health={a.health} /></span>
                  <span style={{ fontSize: 13, ...(touchDays > 21 ? { color: "#966200", fontWeight: 700 } : { color: "var(--color-text-secondary,#666)" }) }}>
                    {touchLabel(touchDays)}
                  </span>
                  <span style={{ textAlign: "right" }}>
                    <button type="button" onClick={(e) => { e.stopPropagation(); action.run(); }} style={actionBtn(action.variant)}>{action.label}</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {current && (
        <Drawer title={current.org} onClose={() => setDrawer(null)}>
          <ClientDrawer
            key={`${current.id}-${drawer?.preset ?? ""}`}
            account={current}
            preset={drawer?.preset ?? null}
            onStartUpgrade={() => void startUpgrade(current)}
            onOpenUpgrade={(dealId) => router.push(`/sales?deal=${dealId}`)}
            onScheduleCheckin={() => void scheduleCheckin(current)}
            onLog={(type, note) => logInteraction(current, type, note)}
          />
        </Drawer>
      )}

      {toastNode}
    </div>
  );
}

// ── the Client drawer (spec §9) ──────────────────────────────────────────

function ClientDrawer({ account: a, preset, onStartUpgrade, onOpenUpgrade, onScheduleCheckin, onLog }: {
  account: ClientAccountRow;
  preset: "checkin" | "note" | null;
  onStartUpgrade: () => void;
  onOpenUpgrade: (dealId: string) => void;
  onScheduleCheckin: () => void;
  onLog: (type: string, note: string) => boolean;
}) {
  const pkg = pkgByName(a.pkg);
  const next = nextPkgOf(a.pkg);
  const pct = usagePct(a);
  const atCeiling = pct != null && pct >= AT_CEILING;
  const sinceLabel = new Date(a.since).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const touchDays = daysSince(a.lastTouch);
  const [type, setType] = useState<string>(preset ?? "call");
  const [note, setNote] = useState("");

  const testimonialChip: Record<string, { label: string; bg: string; fg: string }> = {
    torequest: { label: "Testimonial: ready to request", bg: "#fff3d4", fg: "#966200" },
    requested: { label: "Testimonial requested", bg: "#fff3d4", fg: "#966200" },
    received: { label: "Testimonial received", bg: "#c4eef9", fg: "#0d5e7e" },
    published: { label: "Case study published", bg: "#d4f5e2", fg: "#1a7a4a" },
  };
  const tc = testimonialChip[a.testimonial];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* 1 — contact block */}
      <div>
        <div style={{ fontSize: 13, color: "var(--color-text-secondary,#666)" }}>
          {a.contact}{a.contact && a.email ? " · " : ""}{a.email}
        </div>
        <div style={{ fontSize: 12, color: "var(--color-text-tertiary,#98989d)", marginTop: 3 }}>
          Client since {sinceLabel} · account owner {ownerLabel(a.ownerEmail)}
        </div>
      </div>

      {/* 2 — chip row */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={pkgPill}>{a.pkg}</span>
        <span style={{ fontWeight: 700, fontSize: 16, color: "var(--color-navy-900,#132272)" }}>{priceLabel(a)}</span>
        <HealthChip health={a.health} />
        {tc && <Chip bg={tc.bg} fg={tc.fg}>{tc.label}</Chip>}
      </div>

      {/* 3 — package usage */}
      {pkg?.hours ? (
        <div style={panel}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--color-navy-900,#132272)" }}>Package usage</span>
            <span style={{ fontSize: 12, color: "var(--color-text-secondary,#666)" }}>{Math.round(a.hoursUsed)} of {pkg.hours} hours used this month</span>
          </div>
          <ProgressBar pct={pct ?? 0} fill={atCeiling ? BAR_GRADIENTS.amber : BAR_GRADIENTS.sky} />
          {atCeiling ? (
            <div style={{ fontSize: 12, fontWeight: 600, color: "#966200", marginTop: 8 }}>At the ceiling — a strong signal to talk about the next package.</div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--color-text-tertiary,#98989d)", marginTop: 8 }}>Comfortable headroom this month.</div>
          )}
        </div>
      ) : (
        <div style={{ ...panel, fontSize: 13, color: "var(--color-text-secondary,#666)" }}>
          {Math.round(a.hoursUsed)} hours logged in {monthName()}
        </div>
      )}

      {/* 4 — growth path */}
      {next && next.price != null && (
        <div style={growthCard}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--color-navy-900,#132272)" }}>
            Growth path — {a.pkg} → {next.name}
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary,#666)", marginTop: 4 }}>
            {next.hours} hrs/month · {deltaMoney(next.price - a.price)}/mo · +{pkg?.hours ? next.hours! - pkg.hours : next.hours} hrs
          </div>
          <div style={{ marginTop: 12 }}>
            {a.upgradeDealId ? (
              <button type="button" onClick={() => onOpenUpgrade(a.upgradeDealId!)} style={actionBtn("ghost-sky")}>Upgrade deal in pipeline →</button>
            ) : (
              <button type="button" onClick={onStartUpgrade} style={actionBtn("solid")}>Start upgrade deal</button>
            )}
          </div>
        </div>
      )}

      {/* 5 — cadence row */}
      <div style={{ ...panel, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13, color: a.checkinDue ? "#966200" : "var(--color-text-secondary,#666)", fontWeight: a.checkinDue ? 600 : 400 }}>
          {a.checkinDue
            ? "Check-in due — no formal cadence set (ad-hoc)."
            : `Relationship is ad-hoc — last touch ${touchLabel(touchDays)}.`}
        </span>
        <button type="button" onClick={onScheduleCheckin} style={actionBtn("ghost")}>Schedule check-in</button>
      </div>

      {/* 6 — log an interaction */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-navy-900,#132272)", marginBottom: 8 }}>Log an interaction</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select value={type} onChange={(e) => setType(e.target.value)} style={{ ...input, width: 110, flex: "none" }}>
            <option value="call">Call</option>
            <option value="email">Email</option>
            <option value="note">Note</option>
            <option value="checkin">Check-in</option>
          </select>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && onLog(type, note)) setNote(""); }}
            placeholder="What happened? e.g. Called re: July priorities"
            style={{ ...input, flex: 1, minWidth: 180 }}
          />
          <button type="button" onClick={() => { if (onLog(type, note)) setNote(""); }} style={actionBtn("solid")}>Log</button>
        </div>
      </div>

      {/* 7 — timeline */}
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: "var(--color-navy-900,#132272)", marginBottom: 4 }}>Timeline</div>
        {a.timeline.length === 0 && <p style={{ fontSize: 13, color: "var(--color-text-tertiary,#98989d)", margin: "6px 0 0" }}>No interactions logged yet.</p>}
        {a.timeline.map((t, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i === 0 ? "none" : "1px solid var(--color-border-subtle,#eee)" }}>
            <KindChip kind={t.type} />
            <span style={{ flex: 1, fontSize: 13, color: "var(--color-text-secondary,#666)" }}>{t.note}</span>
            <span style={{ fontSize: 12, color: "var(--color-text-tertiary,#98989d)", whiteSpace: "nowrap" }}>{shortDate(t.date)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** "+$600" / "−$150" for the growth-path price delta. */
function deltaMoney(n: number): string {
  return `${n >= 0 ? "+" : "−"}$${Math.abs(Math.round(n)).toLocaleString()}`;
}

// ── drawer shell ─────────────────────────────────────────────────────────

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(13,29,95,0.35)", zIndex: 90 }} />
      <aside role="dialog" aria-modal="true" aria-label={title} style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: "min(560px, 92vw)", background: "var(--color-surface,#fff)", boxShadow: "-8px 0 40px rgba(15,28,94,0.18)", zIndex: 91, padding: "24px 28px", overflowY: "auto", animation: "drawerIn 0.25s ease" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
          <h2 style={{ margin: 0, fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", color: "var(--color-navy-900,#132272)" }}>{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", fontSize: 22, cursor: "pointer", color: "var(--color-text-tertiary,#98989d)" }}>×</button>
        </div>
        {children}
      </aside>
    </>
  );
}

// ── styles ──────────────────────────────────────────────────────────────

const rowGrid: CSSProperties = { display: "grid", gridTemplateColumns: "minmax(220px,1.5fr) 160px 140px 150px 110px 180px", alignItems: "center", gap: 12 };
const pkgPill: CSSProperties = { display: "inline-block", padding: "2px 8px", borderRadius: 9999, fontSize: 11, fontWeight: 600, background: "var(--color-sky-50,#e7f8fd)", color: "var(--color-sky-700,#157ba0)" };
const panel: CSSProperties = { background: "var(--color-bg-secondary,#f5f5f7)", borderRadius: 12, padding: "14px 16px" };
const growthCard: CSSProperties = {
  borderRadius: 14,
  padding: 16,
  border: "1px solid transparent",
  background: "linear-gradient(var(--color-surface,#fff), var(--color-surface,#fff)) padding-box, linear-gradient(135deg, #6278d5, #4dc4e8) border-box",
};
const input: CSSProperties = { border: "1px solid var(--color-border,#ccc)", borderRadius: 8, padding: "8px 10px", font: "inherit", fontSize: 13 };

function actionBtn(variant: "solid" | "ghost" | "ghost-sky"): CSSProperties {
  const base: CSSProperties = { borderRadius: 9999, padding: "7px 14px", fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" };
  if (variant === "solid") return { ...base, border: "none", background: "var(--color-navy-900,#132272)", color: "#fff" };
  if (variant === "ghost-sky") return { ...base, border: "1px solid var(--color-sky-200,#9ce2f5)", background: "var(--color-sky-50,#e7f8fd)", color: "var(--color-sky-800,#0d5e7e)" };
  return { ...base, border: "1px solid var(--color-border,#d2d2d7)", background: "var(--color-surface,#fff)", color: "var(--color-navy-900,#132272)" };
}
