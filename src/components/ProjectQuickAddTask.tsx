"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

type Assignee = { id: string; name: string | null; email: string; openTasks?: number };

const input: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "8px 10px",
  font: "inherit",
  background: "var(--color-surface)",
  width: "100%",
  boxSizing: "border-box",
};

/**
 * Quick-add a task without leaving the project screen. Pre-links the new task to
 * this project, posts createTask (which fires the best-effort assignment email),
 * then refreshes so the task appears in the list.
 */
export function ProjectQuickAddTask({
  projectId,
  assignees,
}: {
  projectId: string;
  assignees: Assignee[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [priority, setPriority] = useState("Medium");
  const [dueDate, setDueDate] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!title.trim() || !assignedToId) {
      window.alert("Title and assignee are required.");
      return;
    }
    setLoading(true);
    const res = await postAction("/api/hr/tasks", {
      title,
      assignedToId,
      projectId,
      priority,
      strategy: "Create",
      dueDate: dueDate || undefined,
    });
    setLoading(false);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to add task");
      return;
    }
    setTitle("");
    setAssignedToId("");
    setDueDate("");
    setPriority("Medium");
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div style={{ marginBottom: 12 }}>
        <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
          + Add task
        </Button>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 8,
        padding: 12,
        border: "1px dashed var(--color-border)",
        borderRadius: "var(--radius-input)",
        marginBottom: 12,
      }}
    >
      <input
        style={input}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Task title"
        autoFocus
      />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
        <select style={input} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
          <option value="">Assign to… (least busy first)</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name ?? a.email}
              {a.openTasks !== undefined ? ` · ${a.openTasks} open` : ""}
            </option>
          ))}
        </select>
        <select style={input} value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="Low">Low</option>
          <option value="Medium">Medium</option>
          <option value="High">High</option>
        </select>
        <input style={input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </div>
      {assignees.length === 0 && (
        <p className="small" style={{ color: "var(--color-text-tertiary)", margin: 0 }}>
          No VA login accounts exist yet — add VA users to assign tasks to them.
        </p>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <Button onClick={submit} loading={loading} disabled={loading} variant="primary" size="sm">
          Add task
        </Button>
        <Button onClick={() => setOpen(false)} variant="ghost" size="sm">
          Cancel
        </Button>
      </div>
    </div>
  );
}
