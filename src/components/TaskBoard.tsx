"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { TaskListItem } from "@/lib/reads/tasks";
import { Avatar, DueChip, PriorityBadge } from "@/components/ui/task-format";
import { postAction } from "@/components/ActionButton";

const COLUMNS = [
  { status: "NotStarted", label: "Not Started" },
  { status: "InProgress", label: "In Progress" },
  { status: "Blocked", label: "Blocked" },
  { status: "Done", label: "Done" },
] as const;

export function TaskBoard({ tasks }: { tasks: TaskListItem[] }) {
  const router = useRouter();
  // Seed local state from props so optimistic moves render immediately.
  const [items, setItems] = useState<TaskListItem[]>(tasks);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStatus, setOverStatus] = useState<string | null>(null);

  async function moveTask(id: string, toStatus: string) {
    const task = items.find((t) => t.id === id);
    if (!task || task.status === toStatus) return;

    const prevStatus = task.status;
    // Optimistic move.
    setItems((cur) =>
      cur.map((t) => (t.id === id ? { ...t, status: toStatus as TaskListItem["status"] } : t)),
    );

    const res = await postAction(`/api/va/tasks/${id}/status`, { status: toStatus });
    if (!res.ok) {
      // Revert on failure.
      setItems((cur) =>
        cur.map((t) => (t.id === id ? { ...t, status: prevStatus } : t)),
      );
      window.alert(res.error ?? "Failed to update task status");
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 8 }}>
      {COLUMNS.map((col) => {
        const colTasks = items.filter((t) => t.status === col.status);
        const isOver = overStatus === col.status;
        return (
          <div
            key={col.status}
            onDragOver={(e) => {
              e.preventDefault();
              if (overStatus !== col.status) setOverStatus(col.status);
            }}
            onDragLeave={() => {
              if (overStatus === col.status) setOverStatus(null);
            }}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain") || dragId;
              setOverStatus(null);
              setDragId(null);
              if (id) void moveTask(id, col.status);
            }}
            style={{
              flex: "0 0 280px",
              width: 280,
              display: "flex",
              flexDirection: "column",
              gap: 10,
              padding: 10,
              borderRadius: "var(--radius-input)",
              background: isOver ? "var(--color-sky-50, var(--color-bg-secondary))" : "var(--color-bg-secondary)",
              border: isOver
                ? "2px dashed var(--color-sky-500)"
                : "1px solid var(--color-border)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontWeight: 700,
                color: "var(--color-text-secondary)",
                padding: "2px 4px",
              }}
            >
              <span>{col.label}</span>
              <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
                {colTasks.length}
              </span>
            </div>

            {colTasks.map((task) => (
              <div
                key={task.id}
                draggable
                onDragStart={(e) => {
                  setDragId(task.id);
                  e.dataTransfer.setData("text/plain", task.id);
                  e.dataTransfer.effectAllowed = "move";
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOverStatus(null);
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                  padding: 12,
                  borderRadius: "var(--radius-input)",
                  background: "var(--color-bg-primary, #fff)",
                  border: "1px solid var(--color-border)",
                  cursor: "grab",
                  opacity: dragId === task.id ? 0.5 : 1,
                }}
              >
                <a
                  href={`/hr/tasks/${task.id}`}
                  style={{
                    fontWeight: 600,
                    color: "var(--color-text-primary)",
                    textDecoration: "none",
                  }}
                >
                  {task.title}
                </a>

                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Avatar name={task.assignedTo?.name} email={task.assignedTo?.email} size={22} />
                  <span className="small" style={{ color: "var(--color-text-secondary)" }}>
                    {task.assignedTo?.name ?? task.assignedTo?.email ?? "Unassigned"}
                  </span>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <DueChip date={task.dueDate} status={task.status} />
                  <PriorityBadge value={task.priority} />
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
