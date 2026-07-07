"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import type { ScratchRow } from "@/lib/reads/scratch";

type Proposal = {
  title: string;
  description: string | null;
  scratchItemId: string | null;
  state?: "pending" | "confirmed" | "skipped";
};

/**
 * Hub Scratchpad tab (Phase 3): freeform bullets, "→ Task" promotion, and the
 * Purii extraction panel — Purii proposes, a human confirms each item.
 */
export function Scratchpad({
  projectId,
  items,
  canEdit,
  meId,
}: {
  projectId: string;
  items: ScratchRow[];
  canEdit: boolean;
  meId: string;
}) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [proposals, setProposals] = useState<Proposal[] | null>(null);

  async function add() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    const res = await postAction("/api/hr/scratch", { projectId, text });
    if (!res.ok) {
      window.alert(res.error ?? "Failed to add");
      return;
    }
    router.refresh();
  }

  async function editText(id: string, text: string) {
    const res = await postAction("/api/hr/scratch/update", { itemId: id, text });
    if (!res.ok) window.alert(res.error ?? "Failed to save");
    router.refresh();
  }

  async function promote(id: string) {
    setBusyId(id);
    const res = await postAction("/api/hr/scratch/promote", { itemId: id });
    setBusyId(null);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to promote");
      return;
    }
    router.refresh();
  }

  async function extract() {
    setExtracting(true);
    setProposals(null);
    const res = await postAction("/api/hr/scratch/extract", { projectId });
    setExtracting(false);
    if (!res.ok) {
      window.alert(res.error ?? "Extraction failed");
      return;
    }
    const { proposals: p } = res.result as { proposals: Proposal[] };
    setProposals(p.map((x) => ({ ...x, state: "pending" })));
  }

  async function confirmProposal(i: number) {
    const p = proposals![i];
    if (p.scratchItemId) {
      const res = await postAction("/api/hr/scratch/promote", { itemId: p.scratchItemId });
      if (!res.ok) {
        window.alert(res.error ?? "Failed");
        return;
      }
    } else {
      const res = await postAction("/api/hr/tasks", {
        title: p.title,
        projectId,
        strategy: "Create",
        instructions: p.description ?? undefined,
        assignedToId: meId,
      });
      if (!res.ok) {
        window.alert(res.error ?? "Failed");
        return;
      }
    }
    setProposals((prev) => prev!.map((x, j) => (j === i ? { ...x, state: "confirmed" } : x)));
    router.refresh();
  }

  const card: React.CSSProperties = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border-subtle)",
    borderRadius: 24,
    boxShadow: "var(--shadow-sm)",
    padding: "24px 26px",
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr)", gap: 18, alignItems: "start" }}>
      {/* Bullets */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
          <span style={{ fontWeight: 600, color: "var(--color-navy-900, #0f1c5e)" }}>Scratchpad</span>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
            freeform — nobody structures this
          </span>
        </div>
        {items.map((s) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 0" }}>
            <span style={{ flex: "none", color: "var(--color-text-tertiary)" }}>•</span>
            {s.promotedTaskId ? (
              <a
                href={`/hr/tasks/${s.promotedTaskId}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "3px 12px",
                  borderRadius: 999,
                  border: "1px solid var(--color-sky-100, #c9edf8)",
                  background: "var(--color-sky-50, #f0fafd)",
                  color: "var(--color-sky-700, #177a9c)",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  textDecoration: "none",
                }}
              >
                ✓ Task: {s.text}
              </a>
            ) : (
              <>
                {s.fromClient && (
                  <span
                    title="Sent by the client from the portal"
                    style={{
                      flex: "none",
                      fontSize: 10,
                      fontWeight: 700,
                      color: "var(--color-sky-700, #177a9c)",
                      background: "var(--color-sky-50, #f0fafd)",
                      border: "1px solid var(--color-sky-100, #c9edf8)",
                      borderRadius: 999,
                      padding: "1px 7px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    💬 client request
                  </span>
                )}
                <input
                  defaultValue={s.text}
                  disabled={!canEdit}
                  onBlur={(e) => e.target.value !== s.text && void editText(s.id, e.target.value)}
                  style={{
                    flex: 1,
                    border: "none",
                    background: "transparent",
                    font: "inherit",
                    fontSize: "var(--text-sm)",
                    color: "var(--color-text-primary)",
                    padding: "2px 0",
                  }}
                />
                {canEdit && (
                  <button
                    onClick={() => void promote(s.id)}
                    disabled={busyId === s.id}
                    title="Promote to task"
                    style={{
                      flex: "none",
                      height: 26,
                      padding: "0 11px",
                      borderRadius: 999,
                      border: "1px solid var(--color-sky-400, #4DC4E8)",
                      background: "var(--color-surface)",
                      color: "var(--color-sky-600, #1d9cc7)",
                      fontSize: "var(--text-xs)",
                      fontWeight: 600,
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      opacity: busyId === s.id ? 0.6 : 1,
                    }}
                  >
                    → Task
                  </button>
                )}
              </>
            )}
          </div>
        ))}
        {canEdit && (
          <input
            placeholder="Jot an idea and press Enter…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void add()}
            style={{
              width: "100%",
              border: "none",
              borderTop: "1px dashed var(--color-border-subtle)",
              background: "transparent",
              font: "inherit",
              fontSize: "var(--text-sm)",
              padding: "10px 0 4px",
              marginTop: 8,
            }}
          />
        )}
      </div>

      {/* Purii extraction */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
          <span style={{ fontWeight: 600, color: "var(--color-navy-900, #0f1c5e)" }}>✨ Purii</span>
          <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
            same pipeline as Meeting Actions
          </span>
        </div>

        {!proposals && !extracting && (
          <>
            <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", marginTop: 0 }}>
              Purii reads the scratchpad and proposes tasks. You confirm each one — nothing is
              created behind your back.
            </p>
            {canEdit && (
              <button
                onClick={() => void extract()}
                style={{
                  height: 34,
                  padding: "0 16px",
                  borderRadius: 999,
                  border: "none",
                  background: "var(--color-navy-900, #132272)",
                  color: "#fff",
                  fontSize: "var(--text-sm)",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Extract action items
              </button>
            )}
          </>
        )}

        {extracting && (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>
            Reading scratchpad…
          </p>
        )}

        {proposals && proposals.length === 0 && (
          <p style={{ fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>
            Nothing actionable found.
          </p>
        )}

        {proposals?.map((p, i) => (
          <div
            key={i}
            style={{
              border: `1px solid ${p.state === "confirmed" ? "rgba(48,201,122,.35)" : "var(--color-border-subtle)"}`,
              background: p.state === "confirmed" ? "var(--color-success-light, #e6f9ef)" : "var(--color-surface)",
              borderRadius: 14,
              padding: "10px 14px",
              marginBottom: 8,
            }}
          >
            <div
              style={{
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                color: "var(--color-navy-900, #0f1c5e)",
                textDecoration: p.state === "skipped" ? "line-through" : "none",
              }}
            >
              {p.title}
            </div>
            <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", margin: "2px 0 8px" }}>
              {p.state === "confirmed"
                ? "✓ Added to tasks"
                : p.state === "skipped"
                  ? "Skipped"
                  : (p.description ?? "Proposed · assigned to you on confirm")}
            </div>
            {p.state === "pending" && (
              <div style={{ display: "flex", gap: 7 }}>
                <button
                  onClick={() => void confirmProposal(i)}
                  style={{
                    height: 28,
                    padding: "0 13px",
                    borderRadius: 999,
                    border: "none",
                    background: "var(--color-navy-900, #132272)",
                    color: "#fff",
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Confirm → task
                </button>
                <button
                  onClick={() =>
                    setProposals((prev) => prev!.map((x, j) => (j === i ? { ...x, state: "skipped" } : x)))
                  }
                  style={{
                    height: 28,
                    padding: "0 13px",
                    borderRadius: 999,
                    border: "1px solid var(--color-border)",
                    background: "var(--color-surface)",
                    color: "var(--color-text-secondary)",
                    fontSize: "var(--text-xs)",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Skip
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
