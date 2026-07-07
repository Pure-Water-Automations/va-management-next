"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

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

/** Most-frequently-suggested assignee across the card's items, or null. */
function leadAssignee(items: MeetingItem[]): string | null {
  const counts = new Map<string, number>();
  for (const it of items) {
    if (it.suggestedAssignee) counts.set(it.suggestedAssignee, (counts.get(it.suggestedAssignee) ?? 0) + 1);
  }
  let best: string | null = null, bestN = 0;
  for (const [name, n] of counts) if (n > bestN) { best = name; bestN = n; }
  return best;
}

export function MeetingActionsClient({ cards, assignees, canConfirm }: { cards: MeetingCard[]; assignees: Assignee[]; canConfirm: boolean }) {
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
    let done = 0;
    try {
      for (const it of card.items) {
        const edit = edits[it.id];
        await post(`/api/meeting-actions/${card.id}/confirm`, { itemId: it.id, assigneeId: edit.assigneeId, dueDate: edit.dueDate || undefined });
        done++;
      }
      router.refresh();
    } catch (e) {
      setError(
        `Confirmed ${done} of ${card.items.length}. ${e instanceof Error ? e.message : "An item failed"}. The rest are still pending.`
      );
      router.refresh();
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

  // Shared styles for form controls using the real design tokens.
  const inputStyle: React.CSSProperties = {
    background: "var(--color-bg)",
    border: "1px solid var(--color-border)",
    borderRadius: "var(--radius-input)",
    color: "inherit",
    fontSize: 12,
    padding: "3px 6px",
  };

  if (cards.length === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <div className="crumb">Meetings</div>
            <h1>Meeting Actions</h1>
          </div>
        </div>
        <p style={{ color: "var(--color-text-tertiary)" }}>
          No pending meeting actions — check back after the next transcript is processed.
        </p>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Meetings</div>
          <h1>Meeting Actions</h1>
          <p className="small" style={{ marginTop: 4 }}>
            AI-extracted tasks from recent meeting transcripts — review and confirm.
          </p>
        </div>
        <span style={{ color: "var(--color-text-tertiary)", fontSize: 13, alignSelf: "flex-end" }}>
          {cards.length} meeting{cards.length === 1 ? "" : "s"} pending · {totalItems} item{totalItems === 1 ? "" : "s"}
        </span>
      </div>

      {error && (
        <div style={{ background: "var(--color-error-light)", color: "var(--color-error)", padding: "8px 12px", borderRadius: "var(--radius-sm)", marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {!canConfirm && (
        <div
          style={{
            display: "flex",
            gap: 8,
            alignItems: "flex-start",
            background: "var(--color-info-light)",
            color: "var(--color-info-dark)",
            padding: "10px 12px",
            borderRadius: "var(--radius-sm)",
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          <span aria-hidden style={{ fontSize: 15, lineHeight: 1.1 }}>ℹ️</span>
          <span>
            <strong>No “Confirm” button? That’s expected for your role.</strong> You can
            review and skip these suggestions, but turning one into a task needs delegation
            permission. Ask a team lead or admin to confirm them — or to enable confirming
            for your tier.
          </span>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {cards.map((card) => {
          const isCollapsed = collapsed[card.id];
          const lead = leadAssignee(card.items);
          return (
            <Card key={card.id} padding={0}>
              {/* Card header */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: isCollapsed ? "none" : "1px solid var(--color-border)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
                  <span
                    aria-hidden
                    style={{
                      flex: "none",
                      width: 38,
                      height: 38,
                      borderRadius: 12,
                      background: "var(--color-sky-50, #f0fafd)",
                      border: "1px solid var(--color-sky-100, #c9edf8)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 16,
                    }}
                  >
                    🎥
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", color: "var(--color-navy-900, #0f1c5e)" }}>
                      {card.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", marginTop: 2 }}>
                      {[fmtDate(card.date), card.zoomAccount, lead ? `${lead} (lead)` : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flex: "none" }}>
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      height: 22,
                      padding: "0 10px",
                      borderRadius: 999,
                      background: "var(--color-sky-50, #f0fafd)",
                      color: "var(--color-sky-700, #177a9c)",
                      border: "1px solid var(--color-sky-100, #c9edf8)",
                      fontSize: 12,
                      fontWeight: 600,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {card.items.length} pending
                  </span>
                  {canConfirm && (
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={() => confirmAll(card)}
                      disabled={busy !== null}
                    >
                      Confirm all ({card.items.length})
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="xs"
                    onClick={() => skipAll(card)}
                    disabled={busy !== null}
                  >
                    Skip all
                  </Button>
                  <Button
                    variant="text"
                    size="xs"
                    onClick={() => setCollapsed((c) => ({ ...c, [card.id]: !c[card.id] }))}
                  >
                    {isCollapsed ? "Expand ▾" : "Collapse ▴"}
                  </Button>
                </div>
              </div>

              {/* Item cards (design: bordered proposal boxes) */}
              {!isCollapsed && (
                <div style={{ padding: "12px 18px 14px" }}>
                  {card.items.map((it) => (
                    <div
                      key={it.id}
                      style={{
                        border: "1px solid var(--color-border-subtle)",
                        background: "var(--color-surface)",
                        borderRadius: 14,
                        padding: "10px 14px",
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--color-navy-900, #0f1c5e)" }}>{it.title}</div>
                      {(it.description || it.clientContext) && (
                        <div style={{ fontSize: 12, color: "var(--color-text-tertiary)", margin: "2px 0 8px" }}>
                          {[it.description, it.clientContext].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
                        <select
                          aria-label="Assignee"
                          value={edits[it.id]?.assigneeId ?? ""}
                          onChange={(e) => setEdits((s) => ({ ...s, [it.id]: { ...s[it.id], assigneeId: e.target.value } }))}
                          style={inputStyle}
                        >
                          <option value="">Unassigned</option>
                          {assignees.map((a) => (
                            <option key={a.id} value={a.id}>{a.name ?? a.email}</option>
                          ))}
                        </select>
                        <input
                          type="date"
                          aria-label="Due date"
                          value={edits[it.id]?.dueDate ?? ""}
                          onChange={(e) => setEdits((s) => ({ ...s, [it.id]: { ...s[it.id], dueDate: e.target.value } }))}
                          style={inputStyle}
                        />
                        {canConfirm && (
                          <button
                            aria-label={`Add task: ${it.title}`}
                            onClick={() => confirmItem(card.id, it)}
                            disabled={busy !== null}
                            style={{
                              height: 28,
                              padding: "0 13px",
                              borderRadius: 999,
                              border: "none",
                              background: "var(--color-navy-900, #132272)",
                              color: "#fff",
                              fontSize: 12,
                              fontWeight: 600,
                              cursor: busy !== null ? "not-allowed" : "pointer",
                              whiteSpace: "nowrap",
                              opacity: busy !== null ? 0.5 : 1,
                            }}
                          >
                            Confirm → task
                          </button>
                        )}
                        <button
                          aria-label={`Skip: ${it.title}`}
                          onClick={() => skipItem(card.id, it.id)}
                          disabled={busy !== null}
                          style={{
                            height: 28,
                            padding: "0 13px",
                            borderRadius: 999,
                            border: "1px solid var(--color-border)",
                            background: "var(--color-surface)",
                            color: "var(--color-text-secondary)",
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: busy !== null ? "not-allowed" : "pointer",
                            opacity: busy !== null ? 0.5 : 1,
                          }}
                        >
                          Skip
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <p style={{ fontSize: 12.5, color: "var(--color-text-tertiary)", lineHeight: 1.5, marginTop: 16 }}>
        Extracted hourly from Zoom transcripts — the same confirm-first pipeline the scratchpad uses.
        Nothing becomes a task until you approve it.
      </p>
    </>
  );
}
