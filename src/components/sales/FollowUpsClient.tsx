"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import { KindChip, useToast, cardStyle, postJson } from "@/components/sales/ui";
import type { FollowUpRow } from "@/lib/reads/sales-console";

const call = (body: Record<string, unknown>) => postJson("/api/sales/console", body);

/** Whole days between today and the due date, in local time (negative = overdue). */
function dayDiff(dueIso: string): number {
  const due = new Date(dueIso);
  const now = new Date();
  const a = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((a - b) / 86400000);
}

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultDue(): string {
  const d = new Date();
  d.setDate(d.getDate() + 2);
  return toDateInput(d);
}

/** The "when" label + its style, per group. */
function whenLabel(diff: number, dueIso: string): { text: string; style: CSSProperties } {
  if (diff < 0) return { text: `${-diff}d overdue`, style: { color: "#a32d2d", fontWeight: 700 } };
  if (diff === 0) return { text: "Today", style: { color: "#0d5e7e", fontWeight: 700 } };
  const d = new Date(dueIso);
  return {
    text: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
    style: { color: "var(--color-text-tertiary,#98989d)" },
  };
}

export function FollowUpsClient({ followUps }: { followUps: FollowUpRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState<FollowUpRow[]>(followUps);
  const [showAdd, setShowAdd] = useState(false);
  const [title, setTitle] = useState("");
  const [due, setDue] = useState(defaultDue);
  const [toastNode, showToast] = useToast();

  const groups = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.due.localeCompare(b.due));
    return [
      { key: "overdue", label: "Overdue", dot: "#a32d2d", items: sorted.filter((f) => dayDiff(f.due) < 0) },
      { key: "today", label: "Today", dot: "#0d5e7e", items: sorted.filter((f) => dayDiff(f.due) === 0) },
      { key: "up", label: "Coming up", dot: "#7c7c82", items: sorted.filter((f) => dayDiff(f.due) > 0) },
    ];
  }, [items]);

  async function add() {
    if (!title.trim()) { showToast("Give the follow-up a title."); return; }
    const res = await call({ op: "followup_add", title: title.trim(), due, kind: "email" });
    if (res.ok && res.result) {
      const r = res.result as { id: string; due: string };
      setItems((p) => [...p, { id: r.id, due: r.due, title: title.trim(), detail: "Added manually", kind: "email", refType: null, refId: null }]);
      setTitle("");
      setDue(defaultDue());
      setShowAdd(false);
      showToast("Follow-up added.");
    } else {
      showToast(res.error || "Failed to add.");
    }
  }

  function snooze(f: FollowUpRow) {
    const d = new Date(f.due);
    d.setDate(d.getDate() + 7);
    setItems((p) => p.map((x) => (x.id === f.id ? { ...x, due: d.toISOString() } : x)));
    showToast("Snoozed one week.");
    void call({ op: "followup_snooze", id: f.id }).then((res) => { if (!res.ok) { showToast(res.error || "Snooze failed."); router.refresh(); } });
  }

  function done(f: FollowUpRow) {
    setItems((p) => p.filter((x) => x.id !== f.id));
    showToast("Done — nice work.");
    void call({ op: "followup_done", id: f.id }).then((res) => { if (!res.ok) { showToast(res.error || "Failed."); router.refresh(); } });
  }

  function open(f: FollowUpRow) {
    if (!f.refType || !f.refId) return;
    router.push(f.refType === "deal" ? `/sales?deal=${f.refId}` : `/sales/clients?account=${f.refId}`);
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 14 }}>
        <button type="button" onClick={() => setShowAdd((s) => !s)} style={primaryBtn}>
          {showAdd ? "Cancel" : "+ Add follow-up"}
        </button>
      </div>

      {showAdd && (
        <div style={{ ...cardStyle, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginBottom: 18 }}>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
            placeholder="What needs doing? e.g. Send recap to Anchor Youth"
            style={{ ...input, flex: 1, minWidth: 240 }}
          />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} style={input} />
          <button type="button" onClick={() => void add()} style={primaryBtn}>Add</button>
        </div>
      )}

      {groups.map((g) => (
        <section key={g.key} style={{ marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: g.dot, display: "inline-block" }} />
            <span style={{ fontSize: 19, fontFamily: "var(--font-display)", fontWeight: 600, color: "var(--color-navy-900,#132272)" }}>{g.label}</span>
            <span style={countPill}>{g.items.length}</span>
          </div>
          {g.items.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--color-text-tertiary,#98989d)", margin: "2px 0 0 18px" }}>Nothing here — clear water.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {g.items.map((f) => {
                const when = whenLabel(dayDiff(f.due), f.due);
                return (
                  <div key={f.id} style={{ ...cardStyle, padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
                    <KindChip kind={f.kind} />
                    <div style={{ flex: 1, minWidth: 200 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: "var(--color-navy-900,#132272)" }}>{f.title}</div>
                      {f.detail && <div style={{ fontSize: 12, color: "var(--color-text-tertiary,#98989d)", marginTop: 2 }}>{f.detail}</div>}
                    </div>
                    <span style={{ fontSize: 12, whiteSpace: "nowrap", ...when.style }}>{when.text}</span>
                    <div style={{ display: "flex", gap: 8 }}>
                      {f.refType && f.refId && (
                        <button type="button" onClick={() => open(f)} style={ghostBtn}>Open</button>
                      )}
                      <button type="button" onClick={() => snooze(f)} style={ghostBtn}>Snooze</button>
                      <button type="button" onClick={() => done(f)} style={solidSmBtn}>Done</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}

      {toastNode}
    </div>
  );
}

// ── styles ──────────────────────────────────────────────────────────────
const primaryBtn: CSSProperties = { border: "none", borderRadius: 9999, padding: "9px 18px", background: "var(--color-navy-900,#132272)", color: "#fff", fontWeight: 600, fontSize: 13, cursor: "pointer" };
const solidSmBtn: CSSProperties = { border: "none", borderRadius: 9999, padding: "7px 14px", background: "var(--color-navy-900,#132272)", color: "#fff", fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" };
const ghostBtn: CSSProperties = { border: "1px solid var(--color-border,#d2d2d7)", borderRadius: 9999, padding: "7px 14px", background: "var(--color-surface,#fff)", color: "var(--color-navy-900,#132272)", fontWeight: 600, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" };
const input: CSSProperties = { border: "1px solid var(--color-border,#ccc)", borderRadius: 8, padding: "8px 10px", font: "inherit", fontSize: 13 };
const countPill: CSSProperties = { fontSize: 12, fontWeight: 700, color: "var(--color-text-tertiary,#98989d)", background: "var(--color-surface,#fff)", border: "1px solid var(--color-border-subtle,#e8e8ed)", borderRadius: 999, padding: "1px 8px" };
