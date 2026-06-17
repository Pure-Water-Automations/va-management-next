"use client";

import { useState } from "react";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

const CATS = [
  { key: "comm", label: "Communication" },
  { key: "reliability", label: "Reliability" },
  { key: "ownership", label: "Ownership" },
  { key: "skillFit", label: "Skill fit" },
];
const RECS: [string, string][] = [
  ["recommend_hire", "Recommend hire"],
  ["consider", "Consider"],
  ["on_waitlist", "Waitlist"],
  ["pass", "Pass"],
];

export function InterviewForm({ candidateId, onDone }: { candidateId: string; onDone: () => void }) {
  const [scores, setScores] = useState<Record<string, string>>({});
  const [rec, setRec] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const ready = CATS.every((c) => scores[c.key]) && rec;

  async function submit() {
    if (!ready) { setErr("Score every category and pick a recommendation."); return; }
    setErr("");
    setBusy(true);
    const res = await postAction("/api/recruitment/save-interview", {
      candidateId,
      scores: Object.fromEntries(CATS.map((c) => [c.key, Number(scores[c.key])])),
      recommendation: rec,
      notes: notes.trim() || undefined,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.error ?? "Failed to save"); return; }
    onDone();
  }

  return (
    <div style={card}>
      <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", marginBottom: 8 }}>Record interview</div>
      {CATS.map((c) => (
        <div key={c.key} style={row}>
          <span style={{ fontSize: "var(--text-sm)" }}>{c.label}</span>
          <select style={sel} value={scores[c.key] ?? ""} onChange={(e) => setScores((s) => ({ ...s, [c.key]: e.target.value }))}>
            <option value="">–</option>
            {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      ))}
      <div style={row}>
        <span style={{ fontSize: "var(--text-sm)" }}>Recommendation</span>
        <select style={{ ...sel, width: 150 }} value={rec} onChange={(e) => setRec(e.target.value)}>
          <option value="">Select…</option>
          {RECS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} style={ta} />
      {err && <div style={{ color: "var(--color-error, #b42318)", fontSize: "var(--text-xs)", marginBottom: 8 }}>{err}</div>}
      <Button size="sm" variant="primary" loading={busy} disabled={busy} onClick={submit}>Save interview</Button>
    </div>
  );
}

const card: React.CSSProperties = { textAlign: "left", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: 14 };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 };
const sel: React.CSSProperties = { border: "1px solid var(--color-border)", borderRadius: 8, padding: "5px 8px", font: "inherit", fontSize: "var(--text-sm)" };
const ta: React.CSSProperties = { width: "100%", minHeight: 50, border: "1px solid var(--color-border)", borderRadius: 8, padding: "7px 9px", font: "inherit", fontSize: "var(--text-sm)", margin: "4px 0 10px" };
