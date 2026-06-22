"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/task-format";

export type DependencyData = {
  id: string;
  dependsOn: { id: string; title: string; status: string };
};

const inputStyle: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "8px 10px",
  font: "inherit",
  background: "var(--color-surface)",
};

export function TaskDependencies({
  taskId,
  dependencies,
  candidateTasks,
  canManage,
}: {
  taskId: string;
  dependencies: DependencyData[];
  candidateTasks: { id: string; title: string }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Tasks already depended on shouldn't appear in the picker again.
  const existingIds = new Set(dependencies.map((d) => d.dependsOn.id));
  const options = candidateTasks.filter((t) => !existingIds.has(t.id));

  async function add() {
    if (!selected) return;
    setBusy("__add");
    const res = await postAction("/api/hr/dependencies", { taskId, dependsOnTaskId: selected });
    setBusy(null);
    if (!res.ok) {
      window.alert(res.error ?? "Add failed");
      return;
    }
    setSelected("");
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(id);
    const res = await postAction("/api/hr/dependencies/delete", { id });
    setBusy(null);
    if (!res.ok) {
      window.alert(res.error ?? "Remove failed");
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {dependencies.length === 0 ? (
        <p className="small" style={{ color: "var(--color-text-tertiary)", fontStyle: "italic", margin: 0 }}>
          Not blocked by any tasks.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {dependencies.map((d) => (
            <div
              key={d.id}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              {canManage ? (
                <a
                  href={`/hr/tasks/${d.dependsOn.id}`}
                  style={{ flex: 1, color: "var(--color-sky-700)", textDecoration: "none" }}
                >
                  {d.dependsOn.title}
                </a>
              ) : (
                <span style={{ flex: 1 }}>{d.dependsOn.title}</span>
              )}
              <StatusBadge value={d.dependsOn.status} />
              {canManage && (
                <button
                  type="button"
                  aria-label="Remove dependency"
                  disabled={busy === d.id}
                  onClick={() => remove(d.id)}
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

      {canManage && options.length > 0 && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            style={{ ...inputStyle, flex: 1, minWidth: 0 }}
          >
            <option value="">Add a blocking task…</option>
            {options.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
          <Button
            onClick={add}
            loading={busy === "__add"}
            disabled={busy === "__add" || !selected}
            variant="primary"
            size="sm"
          >
            Add
          </Button>
        </div>
      )}
    </div>
  );
}
