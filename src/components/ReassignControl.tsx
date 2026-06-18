"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";

type Assignee = { id: string; name: string | null; email: string; openTasks?: number };

/** Inline "reassign this task" dropdown (managers only) — workload-sorted options. */
export function ReassignControl({
  taskId,
  currentAssigneeId,
  currentName,
  assignees,
}: {
  taskId: string;
  currentAssigneeId: string;
  currentName: string;
  assignees: Assignee[];
}) {
  const router = useRouter();
  const [val, setVal] = useState(currentAssigneeId);
  const [saving, setSaving] = useState(false);
  const inList = assignees.some((a) => a.id === currentAssigneeId);

  async function change(next: string) {
    setVal(next);
    if (!next || next === currentAssigneeId) return;
    setSaving(true);
    const res = await postAction("/api/hr/tasks/reassign", { taskId, assigneeId: next });
    setSaving(false);
    if (!res.ok) {
      window.alert(res.error ?? "Reassign failed");
      setVal(currentAssigneeId);
      return;
    }
    router.refresh();
  }

  return (
    <select
      value={val}
      disabled={saving}
      onChange={(e) => change(e.target.value)}
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-input)",
        padding: "4px 8px",
        font: "inherit",
        fontSize: "var(--text-sm)",
        background: "var(--color-surface)",
        maxWidth: 260,
      }}
      title="Reassign this task"
    >
      {!inList && <option value={currentAssigneeId}>{currentName} (current)</option>}
      {assignees.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name ?? a.email}
          {a.openTasks !== undefined ? ` · ${a.openTasks} open` : ""}
        </option>
      ))}
    </select>
  );
}
