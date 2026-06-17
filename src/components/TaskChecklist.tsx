"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

export type ChecklistItemData = {
  id: string;
  text: string;
  done: boolean;
  order: number;
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "8px 10px",
  font: "inherit",
  background: "var(--color-surface)",
};

export function TaskChecklist({
  taskId,
  items,
  canManage,
}: {
  taskId: string;
  items: ChecklistItemData[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const total = items.length;
  const done = items.filter((i) => i.done).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  async function toggle(id: string) {
    setBusy(id);
    const res = await postAction("/api/hr/checklist/toggle", { id });
    setBusy(null);
    if (!res.ok) {
      window.alert(res.error ?? "Update failed");
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    const res = await postAction("/api/hr/checklist/delete", { id });
    setBusy(null);
    if (!res.ok) {
      window.alert(res.error ?? "Delete failed");
      return;
    }
    router.refresh();
  }

  async function add() {
    if (!text.trim()) return;
    setBusy("__add");
    const res = await postAction("/api/hr/checklist", { taskId, text });
    setBusy(null);
    if (!res.ok) {
      window.alert(res.error ?? "Add failed");
      return;
    }
    setText("");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Progress */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div
          style={{
            flex: 1,
            height: 8,
            borderRadius: 999,
            background: "var(--color-neutral-100)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${pct}%`,
              height: "100%",
              background: "var(--color-success)",
              transition: "width 0.2s ease",
            }}
          />
        </div>
        <span className="small" style={{ color: "var(--color-text-tertiary)", flexShrink: 0 }}>
          {done}/{total}
        </span>
      </div>

      {/* Items */}
      {items.length === 0 ? (
        <p className="small" style={{ color: "var(--color-text-tertiary)", fontStyle: "italic", margin: 0 }}>
          No checklist items yet.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "4px 0",
              }}
            >
              <input
                type="checkbox"
                checked={item.done}
                disabled={busy === item.id}
                onChange={() => toggle(item.id)}
                style={{ flexShrink: 0, cursor: "pointer" }}
              />
              <span
                style={{
                  flex: 1,
                  textDecoration: item.done ? "line-through" : "none",
                  color: item.done ? "var(--color-text-tertiary)" : "var(--color-text-primary)",
                }}
              >
                {item.text}
              </span>
              {canManage && (
                <button
                  type="button"
                  aria-label="Delete checklist item"
                  disabled={busy === item.id}
                  onClick={() => remove(item.id)}
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    color: "var(--color-text-tertiary)",
                    fontSize: "var(--text-base)",
                    lineHeight: 1,
                    padding: "0 4px",
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add();
          }}
          placeholder="Add a checklist item…"
          style={{ ...inputStyle, flex: 1 }}
        />
        <Button
          onClick={add}
          loading={busy === "__add"}
          disabled={busy === "__add" || !text.trim()}
          variant="primary"
          size="sm"
        >
          Add
        </Button>
      </div>
    </div>
  );
}
