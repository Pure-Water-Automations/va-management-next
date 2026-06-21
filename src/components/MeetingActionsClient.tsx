"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export type Assignee = { id: string; name: string | null; email: string };
export type MeetingItem = {
  id: string;
  title: string;
  description: string | null;
  clientContext: string | null;
  suggestedAssignee: string | null;
  suggestedDueDate: string | null; // YYYY-MM-DD
  matchedAssigneeId: string | null;
};
export type MeetingCard = {
  id: string;
  title: string;
  date: string | null; // ISO
  zoomAccount: string | null;
  items: MeetingItem[];
};

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function MeetingActionsClient({ cards, assignees }: { cards: MeetingCard[]; assignees: Assignee[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Per-item editable assignee + due date, seeded from the AI suggestion.
  const [edits, setEdits] = useState<Record<string, { assigneeId: string; dueDate: string }>>(() => {
    const init: Record<string, { assigneeId: string; dueDate: string }> = {};
    for (const c of cards) for (const it of c.items) init[it.id] = { assigneeId: it.matchedAssigneeId ?? "", dueDate: it.suggestedDueDate ?? "" };
    return init;
  });
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    // First card expanded, rest collapsed (matches the mockup).
    const init: Record<string, boolean> = {};
    cards.forEach((c, i) => (init[c.id] = i !== 0));
    return init;
  });

  const totalItems = cards.reduce((n, c) => n + c.items.length, 0);

  async function post(url: string, body: unknown) {
    setError(null);
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({ ok: false, error: "Bad response" }));
    if (!data.ok) throw new Error(data.error || "Request failed");
  }

  async function confirmItem(meetingId: string, it: MeetingItem) {
    const edit = edits[it.id];
    if (!edit?.assigneeId) { setError(`Pick an assignee for "${it.title}" first.`); return; }
    setBusy(it.id);
    try {
      await post(`/api/meeting-actions/${meetingId}/confirm`, { itemId: it.id, assigneeId: edit.assigneeId, dueDate: edit.dueDate || undefined });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm");
    } finally {
      setBusy(null);
    }
  }

  async function skipItem(meetingId: string, itemId: string) {
    setBusy(itemId);
    try {
      await post(`/api/meeting-actions/${meetingId}/skip`, { itemId });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to skip");
    } finally {
      setBusy(null);
    }
  }

  async function confirmAll(card: MeetingCard) {
    const missing = card.items.find((it) => !edits[it.id]?.assigneeId);
    if (missing) { setError(`Pick an assignee for "${missing.title}" before confirming all.`); return; }
    setBusy(card.id);
    try {
      for (const it of card.items) {
        const edit = edits[it.id];
        await post(`/api/meeting-actions/${card.id}/confirm`, { itemId: it.id, assigneeId: edit.assigneeId, dueDate: edit.dueDate || undefined });
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to confirm all");
    } finally {
      setBusy(null);
    }
  }

  async function skipAll(card: MeetingCard) {
    setBusy(card.id);
    try {
      await post(`/api/meeting-actions/${card.id}/skip`, { all: true });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to skip all");
    } finally {
      setBusy(null);
    }
  }

  if (cards.length === 0) {
    return (
      <div>
        <h1 style={{ marginBottom: 4 }}>Meeting Actions</h1>
        <p style={{ color: "var(--color-slate-400, #64748b)" }}>
          No pending meeting actions — check back after the next transcript is processed.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>Meeting Actions</h1>
          <p style={{ color: "var(--color-slate-400, #64748b)", fontSize: 13 }}>
            AI-extracted tasks from recent meeting transcripts — review and confirm.
          </p>
        </div>
        <span style={{ color: "var(--color-slate-400, #94a3b8)", fontSize: 13 }}>
          {cards.length} meeting{cards.length === 1 ? "" : "s"} pending · {totalItems} item{totalItems === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <div style={{ background: "#7f1d1d", color: "#fee2e2", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {cards.map((card) => {
        const isCollapsed = collapsed[card.id];
        const lead =
          card.items.map((i) => i.suggestedAssignee).filter(Boolean).sort((a, b) =>
            card.items.filter((x) => x.suggestedAssignee === b).length - card.items.filter((x) => x.suggestedAssignee === a).length,
          )[0] || null;
        return (
          <div key={card.id} style={{ border: "1px solid var(--color-slate-700, #334155)", borderRadius: 8, marginBottom: 12, background: "var(--color-slate-800, #1e293b)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 16px", borderBottom: isCollapsed ? "none" : "1px solid var(--color-slate-700, #334155)" }}>
              <div>
                <div style={{ fontWeight: 600 }}>{card.title}</div>
                <div style={{ fontSize: 12, color: "var(--color-slate-400, #64748b)", marginTop: 2 }}>
                  {[fmtDate(card.date), card.zoomAccount, lead ? `${lead} (lead)` : null].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <button onClick={() => confirmAll(card)} disabled={busy !== null} style={{ background: "#22c55e", color: "#000", fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 5, border: "none", cursor: "pointer" }}>
                  Confirm all ({card.items.length})
                </button>
                <button onClick={() => skipAll(card)} disabled={busy !== null} style={{ background: "none", border: "none", color: "var(--color-slate-400, #64748b)", fontSize: 12, cursor: "pointer" }}>
                  Skip all
                </button>
                <button onClick={() => setCollapsed((c) => ({ ...c, [card.id]: !c[card.id] }))} style={{ background: "none", border: "none", color: "#60a5fa", fontSize: 12, cursor: "pointer" }}>
                  {isCollapsed ? "Expand ▾" : "Collapse ▴"}
                </button>
              </div>
            </div>

            {!isCollapsed &&
              card.items.map((it) => (
                <div key={it.id} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "10px 16px", borderBottom: "1px solid var(--color-slate-900, #0f172a)" }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#f59e0b", flexShrink: 0, marginTop: 5 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{it.title}</div>
                    {(it.description || it.clientContext) && (
                      <div style={{ fontSize: 12, color: "var(--color-slate-400, #64748b)", marginTop: 2 }}>
                        {[it.description, it.clientContext].filter(Boolean).join(" · ")}
                      </div>
                    )}
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                    <select
                      value={edits[it.id]?.assigneeId ?? ""}
                      onChange={(e) => setEdits((s) => ({ ...s, [it.id]: { ...s[it.id], assigneeId: e.target.value } }))}
                      style={{ background: "var(--color-slate-900, #0f172a)", border: "1px solid var(--color-slate-700, #334155)", borderRadius: 4, color: "inherit", fontSize: 12, padding: "3px 6px" }}
                    >
                      <option value="">Unassigned</option>
                      {assignees.map((a) => (
                        <option key={a.id} value={a.id}>{a.name ?? a.email}</option>
                      ))}
                    </select>
                    <input
                      type="date"
                      value={edits[it.id]?.dueDate ?? ""}
                      onChange={(e) => setEdits((s) => ({ ...s, [it.id]: { ...s[it.id], dueDate: e.target.value } }))}
                      style={{ background: "var(--color-slate-900, #0f172a)", border: "1px solid var(--color-slate-700, #334155)", borderRadius: 4, color: "inherit", fontSize: 12, padding: "3px 6px" }}
                    />
                    <button onClick={() => confirmItem(card.id, it)} disabled={busy !== null} style={{ color: "#22c55e", background: "none", fontSize: 12, cursor: "pointer", padding: "3px 8px", border: "1px solid #22c55e", borderRadius: 4 }}>
                      ✓ Add
                    </button>
                    <button onClick={() => skipItem(card.id, it.id)} disabled={busy !== null} style={{ color: "#ef4444", background: "none", border: "none", fontSize: 12, cursor: "pointer" }}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
          </div>
        );
      })}
    </div>
  );
}
