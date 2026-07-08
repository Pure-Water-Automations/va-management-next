"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { BAR_GRADIENTS, ProgressBar, StatusChip, cardStyle, useToast } from "@/components/sales/ui";
import { fmtTargetValue, monthInfo, paceStatus, type PaceStatus } from "@/lib/sales/pace";
import type { TargetRow } from "@/lib/reads/lead";

const PACE_FILL: Record<PaceStatus, string> = {
  Hit: BAR_GRADIENTS.green,
  "On track": BAR_GRADIENTS.sky,
  Behind: BAR_GRADIENTS.amber,
};

const GROUPS = ["Company", "Sales", "Marketing"];

export function TargetsClient({ targets: initial }: { targets: TargetRow[] }) {
  const [targets, setTargets] = useState(initial);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [toast, showToast] = useToast();
  const timers = useRef<Record<string, number>>({});
  const { elapsed } = useMemo(() => monthInfo(), []);

  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach((t) => window.clearTimeout(t));
  }, []);

  async function save(id: string, target: number) {
    const res = await fetch("/api/lead", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "target_set", id, target }),
    })
      .then((r) => r.json())
      .catch(() => ({ ok: false, error: "Network error — target not saved." }));
    if (!res.ok) showToast(res.error || "Could not save the target.");
  }

  /** Sanitize to an integer ≥ 1; live-updates the bars, debounce-saves. */
  function onEdit(id: string, raw: string) {
    setDrafts((d) => ({ ...d, [id]: raw }));
    const n = Math.round(Number(raw));
    if (!Number.isFinite(n) || n < 1) return; // keep typing; snap on blur
    setTargets((ts) => ts.map((t) => (t.id === id ? { ...t, target: n } : t)));
    window.clearTimeout(timers.current[id]);
    timers.current[id] = window.setTimeout(() => void save(id, n), 600);
  }

  function onBlur(id: string) {
    setDrafts(({ [id]: _drop, ...rest }) => rest); // snap the input back to the sanitized value
    const t = targets.find((x) => x.id === id);
    if (!t) return;
    window.clearTimeout(timers.current[id]);
    void save(id, t.target);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {GROUPS.map((grp) => {
        const rows = targets.filter((t) => t.grp === grp);
        if (rows.length === 0) return null;
        return (
          <section key={grp}>
            <h2 style={groupTitle}>{grp}</h2>
            <div style={{ ...cardStyle, padding: 0, overflow: "hidden" }}>
              {rows.map((t, i) => {
                const pct = t.target > 0 ? t.actual / t.target : 0;
                const status = paceStatus(t.actual, t.target, elapsed);
                return (
                  <div key={t.id} style={{ ...rowStyle, borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--color-border-subtle, #e8e8ed)" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-navy-900, #132272)" }}>{t.label}</div>
                      <div style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>{t.hint}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap" }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 19, fontWeight: 700 }}>
                        {fmtTargetValue(t.actual, t.unit)}
                      </span>
                      <span style={{ fontSize: 12, color: "var(--color-text-tertiary)" }}>of</span>
                      {t.unit === "$" ? <span style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>$</span> : null}
                      <input
                        type="number"
                        min={1}
                        value={drafts[t.id] ?? String(t.target)}
                        onChange={(e) => onEdit(t.id, e.target.value)}
                        onBlur={() => onBlur(t.id)}
                        title="Edit this target"
                        style={targetInput}
                      />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1 }}>
                        <ProgressBar pct={pct} height={8} fill={PACE_FILL[status]} />
                      </div>
                      <span style={{ width: 38, textAlign: "right", fontSize: 12, fontWeight: 700, flex: "none" }}>
                        {Math.round(pct * 100)}%
                      </span>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <StatusChip status={status} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
      {toast}
    </div>
  );
}

const groupTitle: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: 19,
  fontWeight: 700,
  color: "var(--color-navy-900, #132272)",
  margin: "0 0 10px",
};

const rowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(220px, 1.4fr) 150px minmax(140px, 1fr) 110px",
  gap: 14,
  alignItems: "center",
  padding: "14px 18px",
};

const targetInput: CSSProperties = {
  width: 64,
  border: "none",
  borderBottom: "1px dashed var(--color-border-strong, #b5b5bb)",
  background: "transparent",
  textAlign: "right",
  font: "inherit",
  fontSize: 14,
  fontWeight: 600,
  color: "var(--color-navy-900, #132272)",
  outline: "none",
  padding: "2px 2px",
};
