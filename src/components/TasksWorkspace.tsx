"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  StatusBadge,
  PriorityBadge,
  DueChip,
  Avatar,
} from "@/components/ui/task-format";
import { Button } from "@/components/ui/Button";
import { postAction } from "@/components/ActionButton";

// ── Types ────────────────────────────────────────────────────────────────────

type SortKey = "title" | "assignee" | "project" | "priority" | "status" | "due";
type SortDir = "asc" | "desc";

type WorkspaceTask = {
  id: string;
  title: string;
  status: string;
  priority: string;
  strategy: string | null;
  dueDate: Date | string | null;
  client: string | null;
  assignedTo: { name: string | null; email: string | null };
  project: { name: string } | null;
};

type Assignee = { id: string; name: string | null; email: string | null };

// OS Hub custom fields (Phase 1): rendered as extra columns after Due.
type CustomFieldDef = {
  id: string;
  name: string;
  type: "TEXT" | "SELECT" | "DATE" | "PERSON";
  options: string[];
};

const STATUS_OPTIONS = ["NotStarted", "InProgress", "Blocked", "Done"] as const;
const PRIORITY_OPTIONS = ["High", "Medium", "Low"] as const;

function humanize(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function toDateInputValue(date: Date | string | null): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

// ── Component ──────────────────────────────────────────────────────────────────

export function TasksWorkspace({
  tasks,
  assignees,
  sort,
  dir,
  baseQuery,
  group,
  customDefs = [],
  customValues = {},
  canEditFields = false,
}: {
  tasks: WorkspaceTask[];
  assignees: Assignee[];
  sort: SortKey;
  dir: SortDir;
  baseQuery: Record<string, string>;
  group?: string;
  customDefs?: CustomFieldDef[];
  customValues?: Record<string, Record<string, string>>;
  canEditFields?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawerTaskId, setDrawerTaskId] = useState<string | null>(null);
  const [quickAddOpen, setQuickAddOpen] = useState(false);

  const drawerTask = useMemo(
    () => tasks.find((t) => t.id === drawerTaskId) ?? null,
    [tasks, drawerTaskId],
  );

  // ── Sort header links (preserve filters) ──────────────────────────────────
  const sortHref = useCallback(
    (key: SortKey) => {
      const nextDir = sort === key && dir === "asc" ? "desc" : "asc";
      const params = new URLSearchParams({ ...baseQuery, sort: key, dir: nextDir });
      const qs = params.toString();
      return qs ? `/hr/tasks?${qs}` : "/hr/tasks";
    },
    [sort, dir, baseQuery],
  );

  const sortArrow = (key: SortKey) =>
    sort === key ? (dir === "asc" ? " ▲" : " ▼") : "";

  // ── Selection ──────────────────────────────────────────────────────────────
  const allSelected = tasks.length > 0 && selected.size === tasks.length;

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) =>
      prev.size === tasks.length ? new Set() : new Set(tasks.map((t) => t.id)),
    );

  const clearSelection = () => setSelected(new Set());

  // ── Keyboard quick-add (press "n") ─────────────────────────────────────────
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "n" && e.key !== "N") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      const tag = el?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        el?.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      setQuickAddOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // ── Styles ─────────────────────────────────────────────────────────────────
  const thStyle: React.CSSProperties = {
    textAlign: "left",
    padding: "8px 12px",
    fontSize: "var(--text-xs)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--color-text-tertiary)",
    borderBottom: "1px solid var(--color-border)",
    whiteSpace: "nowrap",
  };
  const tdStyle: React.CSSProperties = {
    padding: "10px 12px",
    borderBottom: "1px solid var(--color-border)",
    verticalAlign: "middle",
  };
  const sortLinkStyle: React.CSSProperties = {
    color: "inherit",
    textDecoration: "none",
    cursor: "pointer",
  };

  const columns: { key: SortKey; label: string }[] = [
    { key: "title", label: "Task" },
    { key: "assignee", label: "Assignee" },
    { key: "project", label: "Project" },
    { key: "priority", label: "Priority" },
    { key: "status", label: "Status" },
    { key: "due", label: "Due" },
  ];

  // Total columns in the table (checkbox + data columns + custom fields) — for
  // the group header colspan.
  const totalColumns = columns.length + 1 + customDefs.length;

  // ── Grouping: partition the (already-sorted) rows into labeled groups ─────────
  function groupLabelOf(t: WorkspaceTask): string {
    if (group?.startsWith("field:")) {
      const fieldId = group.slice("field:".length);
      const def = customDefs.find((d) => d.id === fieldId);
      return customValues[t.id]?.[fieldId] ?? `No ${def?.name ?? "value"}`;
    }
    switch (group) {
      case "project":
        return t.project?.name ?? "No project";
      case "assignee":
        return t.assignedTo.name ?? t.assignedTo.email ?? "Unassigned";
      case "status":
        return humanize(t.status);
      default:
        return "";
    }
  }

  const groups: { label: string; rows: WorkspaceTask[] }[] = [];
  if (group) {
    const index = new Map<string, { label: string; rows: WorkspaceTask[] }>();
    for (const t of tasks) {
      const label = groupLabelOf(t);
      let g = index.get(label);
      if (!g) {
        g = { label, rows: [] };
        index.set(label, g);
        groups.push(g);
      }
      g.rows.push(t);
    }
  }

  // Single row renderer reused for flat and grouped layouts.
  const renderRow = (t: WorkspaceTask) => {
    const isSelected = selected.has(t.id);
    return (
      <tr
        key={t.id}
        onClick={() => setDrawerTaskId(t.id)}
        style={{
          cursor: "pointer",
          background: isSelected ? "var(--color-sky-50)" : undefined,
        }}
      >
        <td
          style={{ ...tdStyle, width: 36 }}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            aria-label={`Select ${t.title}`}
            checked={isSelected}
            onChange={() => toggleOne(t.id)}
            style={{ cursor: "pointer" }}
          />
        </td>
        <td style={tdStyle}>
          <a
            href={`/hr/tasks/${t.id}`}
            onClick={(e) => e.stopPropagation()}
            style={{ fontWeight: 600, textDecoration: "none" }}
          >
            {t.title}
          </a>
        </td>
        <td style={tdStyle}>
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
            <Avatar
              name={t.assignedTo.name}
              email={t.assignedTo.email}
              size={22}
            />
            <span className="small" style={{ whiteSpace: "nowrap" }}>
              {t.assignedTo.name ?? t.assignedTo.email}
            </span>
          </span>
        </td>
        <td style={{ ...tdStyle, color: "var(--color-text-secondary)" }}>
          {t.project?.name ?? (t.client ? t.client : "—")}
        </td>
        <td style={tdStyle}>
          <PriorityBadge value={t.priority} />
        </td>
        <td style={tdStyle}>
          <StatusBadge value={t.status} />
        </td>
        <td style={tdStyle}>
          <DueChip date={t.dueDate} status={t.status} />
        </td>
        {customDefs.map((def) => (
          <td
            key={def.id}
            style={tdStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <CustomFieldCell
              def={def}
              taskId={t.id}
              value={customValues[t.id]?.[def.id] ?? ""}
              canEdit={canEditFields}
              onSaved={() => router.refresh()}
            />
          </td>
        ))}
      </tr>
    );
  };

  const groupHeaderStyle: React.CSSProperties = {
    padding: "8px 12px",
    background: "var(--color-bg-secondary)",
    borderBottom: "1px solid var(--color-border)",
    borderTop: "1px solid var(--color-border)",
    fontSize: "var(--text-xs)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--color-text-secondary)",
    fontWeight: 700,
  };

  return (
    <div style={{ position: "relative" }}>
      {/* Keyboard hint */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          marginBottom: 8,
        }}
      >
        <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
          Press{" "}
          <kbd
            style={{
              padding: "1px 6px",
              borderRadius: 4,
              border: "1px solid var(--color-border)",
              background: "var(--color-bg-secondary)",
              fontSize: "var(--text-xs)",
              fontFamily: "var(--font-mono, monospace)",
            }}
          >
            N
          </kbd>{" "}
          for new task
        </span>
      </div>

      {/* Bulk toolbar */}
      {selected.size > 0 && (
        <BulkToolbar
          count={selected.size}
          assignees={assignees}
          onClear={clearSelection}
          onApply={async (fields) => {
            const res = await postAction("/api/hr/tasks/bulk", {
              taskIds: [...selected],
              ...fields,
            });
            if (!res.ok) {
              window.alert(res.error ?? "Bulk update failed");
              return;
            }
            clearSelection();
            router.refresh();
          }}
        />
      )}

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table
          style={{ width: "100%", borderCollapse: "collapse", minWidth: 760 }}
        >
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 36 }}>
                <input
                  type="checkbox"
                  aria-label="Select all tasks"
                  checked={allSelected}
                  onChange={toggleAll}
                  style={{ cursor: "pointer" }}
                />
              </th>
              {columns.map((col) => (
                <th key={col.key} style={thStyle}>
                  <a
                    href={sortHref(col.key)}
                    style={sortLinkStyle}
                    onClick={(e) => {
                      // Client-side sort nav keeps the page (and scroll) put.
                      e.preventDefault();
                      router.push(sortHref(col.key));
                    }}
                  >
                    {col.label}
                    {sortArrow(col.key)}
                  </a>
                </th>
              ))}
              {customDefs.map((def) => (
                <th key={def.id} style={{ ...thStyle, color: "var(--color-sky-600, #1d9cc7)" }}>
                  {def.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {group
              ? groups.map((g) => (
                  <Fragment key={g.label}>
                    <tr>
                      <td colSpan={totalColumns} style={groupHeaderStyle}>
                        {g.label} ({g.rows.length})
                      </td>
                    </tr>
                    {g.rows.map(renderRow)}
                  </Fragment>
                ))
              : tasks.map(renderRow)}
          </tbody>
        </table>
      </div>

      {/* Slide-over drawer */}
      {drawerTask && (
        <TaskDrawer
          task={drawerTask}
          onClose={() => setDrawerTaskId(null)}
          onStatusChange={async (status) => {
            const res = await postAction(
              `/api/va/tasks/${drawerTask.id}/status`,
              { status },
            );
            if (!res.ok) {
              window.alert(res.error ?? "Status update failed");
              return;
            }
            router.refresh();
          }}
        />
      )}

      {/* Quick-add modal */}
      {quickAddOpen && (
        <QuickAddModal
          assignees={assignees}
          onClose={() => setQuickAddOpen(false)}
          onCreate={async (fields) => {
            const res = await postAction("/api/hr/tasks", {
              ...fields,
              strategy: "Create",
            });
            if (!res.ok) {
              window.alert(res.error ?? "Create failed");
              return;
            }
            setQuickAddOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// ── Custom-field cell (OS Hub Phase 1) ─────────────────────────────────────────
// SELECT renders as a slim select; other types edit inline on click. Empty
// commits clear the value (the API deletes the row).

function CustomFieldCell({
  def,
  taskId,
  value,
  canEdit,
  onSaved,
}: {
  def: CustomFieldDef;
  taskId: string;
  value: string;
  canEdit: boolean;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [busy, setBusy] = useState(false);

  async function save(next: string) {
    if (next === value) {
      setEditing(false);
      return;
    }
    setBusy(true);
    const res = await postAction("/api/hr/fields/set-value", {
      fieldId: def.id,
      taskId,
      value: next,
    });
    setBusy(false);
    setEditing(false);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to save");
      return;
    }
    onSaved();
  }

  if (!canEdit) {
    return (
      <span className="small" style={{ color: "var(--color-text-secondary)" }}>
        {value || "—"}
      </span>
    );
  }

  if (def.type === "SELECT" && def.options.length > 0) {
    return (
      <select
        aria-label={`${def.name} value`}
        value={value}
        disabled={busy}
        onChange={(e) => void save(e.target.value)}
        style={{
          font: "inherit",
          fontSize: "var(--text-sm)",
          border: "1px solid transparent",
          borderRadius: 6,
          padding: "2px 4px",
          background: "transparent",
          color: value ? "var(--color-text-primary)" : "var(--color-text-tertiary)",
          cursor: "pointer",
          maxWidth: 140,
        }}
      >
        <option value="">—</option>
        {def.options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        aria-label={`${def.name} value`}
        type={def.type === "DATE" ? "date" : "text"}
        value={draft}
        disabled={busy}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void save(draft);
          if (e.key === "Escape") setEditing(false);
        }}
        onBlur={() => void save(draft)}
        style={{
          font: "inherit",
          fontSize: "var(--text-sm)",
          border: "1px solid var(--color-sky-400, #4DC4E8)",
          borderRadius: 6,
          padding: "2px 6px",
          width: 120,
        }}
      />
    );
  }

  return (
    <button
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      title={`Edit ${def.name}`}
      style={{
        font: "inherit",
        fontSize: "var(--text-sm)",
        border: "none",
        background: "transparent",
        padding: 0,
        cursor: "pointer",
        color: value ? "var(--color-text-secondary)" : "var(--color-text-tertiary)",
      }}
    >
      {value || "—"}
    </button>
  );
}

// ── Bulk toolbar ───────────────────────────────────────────────────────────────

function BulkToolbar({
  count,
  assignees,
  onApply,
  onClear,
}: {
  count: number;
  assignees: Assignee[];
  onApply: (fields: Record<string, unknown>) => Promise<void>;
  onClear: () => void;
}) {
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  const selectStyle: React.CSSProperties = {
    fontSize: "var(--text-sm)",
    padding: "4px 8px",
  };

  async function apply() {
    const fields: Record<string, unknown> = {};
    if (status) fields.status = status;
    if (priority) fields.priority = priority;
    if (assignedToId) fields.assignedToId = assignedToId;
    if (dueDate) fields.dueDate = dueDate;
    if (Object.keys(fields).length === 0) {
      window.alert("Set at least one field to apply.");
      return;
    }
    setBusy(true);
    await onApply(fields);
    setBusy(false);
  }

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 5,
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 10,
        padding: "10px 14px",
        marginBottom: 12,
        borderRadius: "var(--radius-input)",
        border: "1px solid var(--color-sky-100)",
        background: "var(--color-sky-50)",
        boxShadow: "var(--shadow-xs)",
      }}
    >
      <strong style={{ fontSize: "var(--text-sm)" }}>{count} selected</strong>

      <select
        className="input"
        value={status}
        onChange={(e) => setStatus(e.target.value)}
        style={selectStyle}
        aria-label="Bulk set status"
      >
        <option value="">Status…</option>
        {STATUS_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {humanize(s)}
          </option>
        ))}
      </select>

      <select
        className="input"
        value={priority}
        onChange={(e) => setPriority(e.target.value)}
        style={selectStyle}
        aria-label="Bulk set priority"
      >
        <option value="">Priority…</option>
        {PRIORITY_OPTIONS.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>

      <select
        className="input"
        value={assignedToId}
        onChange={(e) => setAssignedToId(e.target.value)}
        style={{ ...selectStyle, maxWidth: 200 }}
        aria-label="Bulk set assignee"
      >
        <option value="">Assignee…</option>
        {assignees.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name ?? a.email}
          </option>
        ))}
      </select>

      <input
        type="date"
        className="input"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        style={selectStyle}
        aria-label="Bulk set due date"
      />

      <Button variant="secondary" size="sm" onClick={apply} loading={busy} disabled={busy}>
        Apply
      </Button>
      <Button variant="ghost" size="sm" onClick={onClear} disabled={busy}>
        Clear
      </Button>
    </div>
  );
}

// ── Slide-over drawer ──────────────────────────────────────────────────────────

function TaskDrawer({
  task,
  onClose,
  onStatusChange,
}: {
  task: WorkspaceTask;
  onClose: () => void;
  onStatusChange: (status: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const rowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    padding: "10px 0",
    borderBottom: "1px solid var(--color-border)",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--color-text-tertiary)",
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.32)",
          zIndex: 50,
        }}
      />
      {/* Panel */}
      <aside
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          bottom: 0,
          width: 420,
          maxWidth: "90vw",
          background: "var(--color-bg, #fff)",
          borderLeft: "1px solid var(--color-border)",
          boxShadow: "var(--shadow-lg, -8px 0 24px rgba(15,23,42,0.18))",
          zIndex: 51,
          padding: 24,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 4,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <h2 style={{ fontSize: "var(--text-lg)", margin: 0 }}>{task.title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              fontSize: 22,
              lineHeight: 1,
              cursor: "pointer",
              color: "var(--color-text-tertiary)",
            }}
          >
            ×
          </button>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Assignee</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Avatar name={task.assignedTo.name} email={task.assignedTo.email} size={22} />
            <span className="small">
              {task.assignedTo.name ?? task.assignedTo.email}
            </span>
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Project</span>
          <span className="small" style={{ color: "var(--color-text-secondary)" }}>
            {task.project?.name ?? "—"}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Client</span>
          <span className="small" style={{ color: "var(--color-text-secondary)" }}>
            {task.client ?? "—"}
          </span>
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Priority</span>
          <PriorityBadge value={task.priority} />
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Status</span>
          <StatusBadge value={task.status} />
        </div>

        <div style={rowStyle}>
          <span style={labelStyle}>Due</span>
          <DueChip date={task.dueDate} status={task.status} />
        </div>

        <div style={{ marginTop: 16 }}>
          <label style={{ ...labelStyle, display: "block", marginBottom: 6 }}>
            Update status
          </label>
          <select
            className="input"
            defaultValue={task.status}
            disabled={busy}
            onChange={async (e) => {
              setBusy(true);
              await onStatusChange(e.target.value);
              setBusy(false);
            }}
            style={{ width: "100%", fontSize: "var(--text-sm)", padding: "6px 8px" }}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </select>
        </div>

        <a
          href={`/hr/tasks/${task.id}`}
          className="btn btn-primary"
          style={{ marginTop: 20, textAlign: "center" }}
        >
          Open full task →
        </a>
      </aside>
    </>
  );
}

// ── Quick-add modal ────────────────────────────────────────────────────────────

function QuickAddModal({
  assignees,
  onClose,
  onCreate,
}: {
  assignees: Assignee[];
  onClose: () => void;
  onCreate: (fields: Record<string, unknown>) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [assignedToId, setAssignedToId] = useState("");
  const [priority, setPriority] = useState<string>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  async function create() {
    if (!title.trim()) {
      window.alert("Title is required.");
      return;
    }
    const fields: Record<string, unknown> = {
      title: title.trim(),
      priority,
    };
    if (assignedToId) fields.assignedToId = assignedToId;
    if (dueDate) fields.dueDate = dueDate;
    setBusy(true);
    await onCreate(fields);
    setBusy(false);
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%",
    fontSize: "var(--text-sm)",
    padding: "6px 8px",
  };
  const labelStyle: React.CSSProperties = {
    fontSize: "var(--text-xs)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    color: "var(--color-text-tertiary)",
    display: "block",
    marginBottom: 4,
    marginTop: 12,
  };

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(15,23,42,0.32)",
          zIndex: 60,
        }}
      />
      <div
        role="dialog"
        aria-label="New task"
        style={{
          position: "fixed",
          top: "18vh",
          left: "50%",
          transform: "translateX(-50%)",
          width: 420,
          maxWidth: "92vw",
          background: "var(--color-bg, #fff)",
          border: "1px solid var(--color-border)",
          borderRadius: "var(--radius-card, 12px)",
          boxShadow: "var(--shadow-lg, 0 16px 40px rgba(15,23,42,0.2))",
          zIndex: 61,
          padding: 24,
        }}
      >
        <h2 style={{ fontSize: "var(--text-lg)", margin: 0, marginBottom: 4 }}>
          New task
        </h2>

        <label style={labelStyle}>Title</label>
        {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
        <input
          autoFocus
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") create();
          }}
          placeholder="What needs to be done?"
          style={fieldStyle}
        />

        <label style={labelStyle}>Assignee</label>
        <select
          className="input"
          value={assignedToId}
          onChange={(e) => setAssignedToId(e.target.value)}
          style={fieldStyle}
        >
          <option value="">Unassigned</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name ?? a.email}
            </option>
          ))}
        </select>

        <label style={labelStyle}>Priority</label>
        <select
          className="input"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          style={fieldStyle}
        >
          {PRIORITY_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>

        <label style={labelStyle}>Due date</label>
        <input
          type="date"
          className="input"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          style={fieldStyle}
        />

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            marginTop: 20,
          }}
        >
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={create}
            loading={busy}
            disabled={busy}
          >
            Create
          </Button>
        </div>
      </div>
    </>
  );
}

// Exported only to keep the helper reachable for tests / reuse if needed.
export { toDateInputValue };
