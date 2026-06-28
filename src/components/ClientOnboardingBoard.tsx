"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Stat } from "@/components/ui/Stat";
import { Badge } from "@/components/ui/Badge";

export type OnboardingRow = {
  orgId: string;
  orgName: string;
  orgStatus: string;
  status: string;
  owner: string | null;
  intakeReceived: boolean;
  onboardingCallBooked: boolean;
  onboardingCallDone: boolean;
  driveFolderCreated: boolean;
  portalAccessGranted: boolean;
  commsCadenceSet: boolean;
  firstWeekPriorities: boolean;
  vaAssigned: boolean;
  kickoffRecapSent: boolean;
};

const CHECKLIST: { field: keyof OnboardingRow; label: string }[] = [
  { field: "intakeReceived", label: "Intake form received" },
  { field: "onboardingCallBooked", label: "Onboarding call booked" },
  { field: "onboardingCallDone", label: "Onboarding call done" },
  { field: "driveFolderCreated", label: "Drive folder created" },
  { field: "portalAccessGranted", label: "Portal access granted" },
  { field: "commsCadenceSet", label: "Comms cadence set" },
  { field: "firstWeekPriorities", label: "First-week priorities set" },
  { field: "vaAssigned", label: "VA assigned" },
  { field: "kickoffRecapSent", label: "Kickoff recap sent" },
];

async function call(body: Record<string, unknown>) {
  const r = await fetch("/api/hr/client-onboarding", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: "Bad response" }));
}

function CheckIcon({ size = 13, stroke = 3, color = "currentColor" }: { size?: number; stroke?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

// Progress ring — SVG r=18, sky-500 stroke, success when n/total, n/total centered.
function Ring({ done, total }: { done: number; total: number }) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const off = c * (1 - done / total);
  const col = done === total ? "var(--color-success)" : "var(--color-sky-500)";
  return (
    <span style={{ position: "relative", width: 46, height: 46, flex: "none", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
      <svg width={46} height={46} viewBox="0 0 46 46">
        <circle cx={23} cy={23} r={r} fill="none" stroke="var(--color-bg-tertiary)" strokeWidth={4} />
        <circle
          cx={23}
          cy={23}
          r={r}
          fill="none"
          stroke={col}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={off}
          transform="rotate(-90 23 23)"
          style={{ transition: "stroke-dashoffset .45s cubic-bezier(.25,.46,.45,.94)" }}
        />
      </svg>
      <span style={{ position: "absolute", fontSize: 12, fontWeight: 700, color: "var(--color-navy-900)", fontFamily: "var(--font-display)" }}>
        {done}/{total}
      </span>
    </span>
  );
}

const BTN_KINDS: Record<string, { bg: string; c: string; bd: string; sh: string }> = {
  navy: { bg: "var(--color-navy-900)", c: "#fff", bd: "none", sh: "var(--shadow-navy-sm)" },
  success: { bg: "var(--color-success)", c: "#fff", bd: "none", sh: "0 3px 10px rgba(48,201,122,.3)" },
  sky: { bg: "var(--color-sky-500)", c: "#fff", bd: "none", sh: "none" },
  danger: { bg: "var(--color-error)", c: "#fff", bd: "none", sh: "none" },
  ghost: { bg: "var(--color-surface)", c: "var(--color-text-secondary)", bd: "1px solid var(--color-border)", sh: "none" },
};

function PillButton({
  kind = "ghost",
  disabled,
  onClick,
  children,
}: {
  kind?: keyof typeof BTN_KINDS;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  const st = BTN_KINDS[kind] || BTN_KINDS.ghost;
  return (
    <button
      type="button"
      disabled={!!disabled}
      onClick={onClick}
      style={{
        appearance: "none",
        border: st.bd,
        cursor: disabled ? "default" : "pointer",
        font: "inherit",
        fontWeight: 600,
        fontSize: "var(--text-sm)",
        color: st.c,
        background: st.bg,
        padding: "0 14px",
        height: 34,
        borderRadius: 999,
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        flexShrink: 0,
        boxShadow: disabled ? "none" : st.sh,
        opacity: disabled ? 0.45 : 1,
        whiteSpace: "nowrap",
        transition: "transform .16s",
      }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "";
      }}
    >
      {children}
    </button>
  );
}

const checkBase: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  padding: "9px 11px",
  borderRadius: "var(--radius-md)",
  cursor: "pointer",
  fontSize: "var(--text-sm)",
  transition: "background .14s, border-color .14s",
};

export function ClientOnboardingBoard({ rows }: { rows: OnboardingRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function run(key: string, body: Record<string, unknown>, toastMsg: string) {
    setBusy(key);
    const res = await call(body);
    setBusy(null);
    if (res.ok) {
      setToast(toastMsg);
      window.clearTimeout((run as unknown as { _t?: number })._t);
      (run as unknown as { _t?: number })._t = window.setTimeout(() => setToast(null), 2400);
      router.refresh();
    } else {
      setToast(res.error || "Failed.");
      window.clearTimeout((run as unknown as { _t?: number })._t);
      (run as unknown as { _t?: number })._t = window.setTimeout(() => setToast(null), 2400);
    }
  }

  // KPIs
  const total = rows.length;
  const inOnboarding = rows.filter((r) => r.status !== "completed").length;
  const avgCompletion = total
    ? Math.round((rows.reduce((a, r) => a + CHECKLIST.filter((c) => r[c.field] as boolean).length / 9, 0) / total) * 100)
    : 0;
  const readyToComplete = rows.filter((r) => CHECKLIST.every((c) => r[c.field] as boolean) && r.status !== "completed").length;
  const awaitingIntake = rows.filter((r) => !r.intakeReceived).length;

  if (rows.length === 0) {
    return (
      <div className="hr-stage">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 14, marginBottom: 22 }}>
          <Stat label="In onboarding" value={0} variant="navy" />
          <Stat label="Avg completion" value={0} unit="%" variant="sky" />
          <Stat label="Ready to complete" value={0} />
          <Stat label="Awaiting intake" value={0} />
        </div>
        <p className="small">No clients in onboarding yet.</p>
      </div>
    );
  }

  return (
    <div className="hr-stage">
      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))", gap: 14, marginBottom: 22 }}>
        <Stat label="In onboarding" value={inOnboarding} variant="navy" />
        <Stat label="Avg completion" value={avgCompletion} unit="%" variant="sky" />
        <Stat label="Ready to complete" value={readyToComplete} />
        <Stat label="Awaiting intake" value={awaitingIntake} />
      </div>

      {/* One rich card per ClientOnboarding */}
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {rows.map((r) => {
          const done = CHECKLIST.filter((c) => r[c.field] as boolean).length;
          const complete = done === 9;
          const completed = r.status === "completed";
          const intakeKey = `intake-${r.orgId}`;
          const doneKey = `done-${r.orgId}`;
          return (
            <div
              key={r.orgId}
              style={{
                background: "var(--color-surface)",
                border: "1px solid var(--color-border-subtle)",
                borderRadius: "var(--radius-card)",
                padding: "20px 22px",
              }}
            >
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", gap: 15, marginBottom: 16 }}>
                <Ring done={done} total={9} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-base)", color: "var(--color-navy-900)" }}>
                      {r.orgName}
                    </span>
                    {completed ? (
                      <Badge variant="success" dot>Completed</Badge>
                    ) : (
                      <Badge variant="sky" dot>In progress</Badge>
                    )}
                  </div>
                  <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", marginTop: 3 }}>
                    {r.owner ? `Owner ${r.owner} · ` : ""}
                    {`Org ${r.orgStatus}`}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, flex: "none" }}>
                  <PillButton
                    kind="ghost"
                    disabled={busy === intakeKey}
                    onClick={() => run(intakeKey, { op: "send_intake", orgId: r.orgId }, `Intake form sent — ${r.orgName}`)}
                  >
                    Send intake form
                  </PillButton>
                  {completed ? (
                    <PillButton kind="ghost" disabled>
                      Completed
                    </PillButton>
                  ) : (
                    <PillButton
                      kind="success"
                      disabled={!complete || busy === doneKey}
                      onClick={() => run(doneKey, { op: "complete", orgId: r.orgId }, `${r.orgName} is live — portal access granted`)}
                    >
                      Mark complete
                    </PillButton>
                  )}
                </div>
              </div>

              {/* Checklist grid */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 7 }}>
                {CHECKLIST.map((c) => {
                  const on = r[c.field] as boolean;
                  const flagKey = `flag-${r.orgId}-${String(c.field)}`;
                  const itemStyle: CSSProperties = on
                    ? {
                        ...checkBase,
                        background: "var(--color-success-light)",
                        border: "1px solid var(--color-success)",
                        color: "var(--color-success-dark)",
                      }
                    : {
                        ...checkBase,
                        background: "transparent",
                        border: "1px solid var(--color-border-subtle)",
                        color: "var(--color-text-secondary)",
                      };
                  return (
                    <div
                      key={String(c.field)}
                      role="button"
                      tabIndex={0}
                      aria-pressed={on}
                      aria-label={c.label}
                      onClick={() => {
                        if (busy === flagKey) return;
                        run(flagKey, { op: "set_flag", orgId: r.orgId, field: c.field, value: !on }, on ? `Unchecked — ${c.label}` : `Checked — ${c.label}`);
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === "Enter" || e.key === " ") && busy !== flagKey) {
                          e.preventDefault();
                          run(flagKey, { op: "set_flag", orgId: r.orgId, field: c.field, value: !on }, on ? `Unchecked — ${c.label}` : `Checked — ${c.label}`);
                        }
                      }}
                      style={{ ...itemStyle, opacity: busy === flagKey ? 0.6 : 1 }}
                      onMouseEnter={(e) => {
                        if (!on) e.currentTarget.style.borderColor = "var(--color-border-strong)";
                      }}
                      onMouseLeave={(e) => {
                        if (!on) e.currentTarget.style.borderColor = "var(--color-border-subtle)";
                      }}
                    >
                      {on ? (
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            flex: "none",
                            borderRadius: 6,
                            background: "var(--color-success)",
                            color: "#fff",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                          }}
                        >
                          <CheckIcon size={13} stroke={3} />
                        </span>
                      ) : (
                        <span style={{ width: 20, height: 20, flex: "none", borderRadius: 6, border: "1.5px solid var(--color-border-strong)" }} />
                      )}
                      <span>{c.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Toast — navy pill, bottom-center, auto-dismiss ~2.4s */}
      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 26,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 70,
            display: "flex",
            alignItems: "center",
            gap: 10,
            background: "var(--color-navy-900)",
            color: "#fff",
            padding: "12px 18px",
            borderRadius: 999,
            boxShadow: "0 12px 34px rgba(0,0,0,.32)",
            fontSize: "var(--text-sm)",
            fontWeight: 500,
            animation: "pwa-fade-up .26s cubic-bezier(.25,.46,.45,.94) both",
          }}
        >
          <span style={{ color: "var(--color-sky-300)", display: "flex" }}>
            <CheckIcon size={15} stroke={3} />
          </span>
          {toast}
        </div>
      )}
    </div>
  );
}
