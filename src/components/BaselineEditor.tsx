"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

const inp: React.CSSProperties = { border: "1px solid var(--color-border)", borderRadius: 6, padding: "4px 6px", font: "inherit", fontSize: "var(--text-sm)" };

export function BaselineCell({ vaId, baselineHours }: { vaId: string; baselineHours: number }) {
  const router = useRouter();
  const [val, setVal] = useState(String(baselineHours ?? 0));
  const [busy, setBusy] = useState(false);
  const dirty = Number(val) !== (baselineHours ?? 0);

  async function save() {
    setBusy(true);
    const res = await postAction("/api/hr/set-baseline", { vaId, baselineHours: Number(val) || 0 });
    setBusy(false);
    if (!res.ok) { window.alert(res.error ?? "Failed"); return; }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <input type="number" min={0} value={val} onChange={(e) => setVal(e.target.value)} style={{ ...inp, width: 72, fontFamily: "var(--font-mono)" }} />
      {dirty && <button onClick={save} disabled={busy} style={{ border: "none", background: "transparent", color: "var(--color-sky-600)", fontWeight: 700, fontSize: "var(--text-xs)", cursor: "pointer" }}>{busy ? "…" : "save"}</button>}
    </div>
  );
}

export function BaselineCutover({ current }: { current: string }) {
  const router = useRouter();
  const [date, setDate] = useState(current);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save() {
    setBusy(true);
    setSaved(false);
    const res = await postAction("/api/hr/baseline-date", { date });
    setBusy(false);
    if (!res.ok) { window.alert(res.error ?? "Failed"); return; }
    setSaved(true);
    router.refresh();
  }

  return (
    <details style={{ marginBottom: 16 }}>
      <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-sky-700, #1a6a8a)" }}>
        Cumulative-hours cutover {current ? `(DeskLog counts from ${current})` : "(not set — counting all DeskLog)"}
      </summary>
      <div style={{ marginTop: 10, background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", padding: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <span className="small">Count DeskLog hours from:</span>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...inp, padding: "6px 9px" }} />
        <Button size="sm" variant="secondary" loading={busy} onClick={save}>Save cutover</Button>
        {saved && <span style={{ color: "var(--color-success-dark)", fontSize: "var(--text-sm)", fontWeight: 600 }}>Saved ✓</span>}
        <span className="small" style={{ color: "var(--color-text-tertiary)", flexBasis: "100%" }}>
          Set this to your switch-over date. Each VA's <strong>Baseline</strong> below carries their old cumulative total up to this date; DeskLog hours on/after it add on top.
        </span>
      </div>
    </details>
  );
}
