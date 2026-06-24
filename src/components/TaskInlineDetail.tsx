"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { ReassignControl } from "@/components/ReassignControl";
import { ClientSelect } from "@/components/ClientSelect";
import { StatusDropdown } from "@/components/TaskActions";
import { PriorityBadge, DueChip, LinkChips } from "@/components/ui/task-format";
import { taskStrategyLabel } from "@/lib/labels";

const STRATEGIES = ["Create", "Research", "Automate", "Communicate", "Plan", "Delegate", "Fix", "TechSupport", "Simplify", "Recurring"] as const;
const PRIORITIES = ["Low", "Medium", "High"] as const;

type Assignee = { id: string; name: string | null; email: string; openTasks?: number };

export type InlineTask = {
  id: string;
  title: string;
  instructions: string | null;
  strategy: string;
  priority: string;
  status: string;
  client: string | null;
  dueDate: string | null; // yyyy-mm-dd
  links: string | null;
  assignedToId: string;
  assignedToName: string;
  assignedByName: string;
  projectId: string | null;
  projectName: string | null;
};

const editorInput: React.CSSProperties = {
  border: "1px solid var(--color-sky-400)",
  borderRadius: "var(--radius-input)",
  padding: "8px 10px",
  font: "inherit",
  fontSize: "var(--text-sm)",
  background: "#fff",
  outline: "none",
  boxShadow: "0 0 0 3px rgba(77,196,232,.18)",
  width: "100%",
  boxSizing: "border-box",
};

export function TaskInlineDetail({
  task,
  clients,
  assignees,
  blocked,
}: {
  task: InlineTask;
  clients: string[];
  assignees: Assignee[];
  blocked: boolean;
}) {
  const router = useRouter();
  const [f, setF] = useState({
    title: task.title,
    instructions: task.instructions ?? "",
    strategy: task.strategy,
    priority: task.priority,
    client: task.client ?? "",
    dueDate: task.dueDate ?? "",
    links: task.links ?? "",
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Resync local fields only when navigating to a DIFFERENT task — not on every
  // router.refresh(), so a save-then-refresh can't clobber an in-flight edit.
  useEffect(() => {
    setF({
      title: task.title,
      instructions: task.instructions ?? "",
      strategy: task.strategy,
      priority: task.priority,
      client: task.client ?? "",
      dueDate: task.dueDate ?? "",
      links: task.links ?? "",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task.id]);

  async function commit(next: Partial<typeof f>) {
    const keys = Object.keys(next) as (keyof typeof f)[];
    const merged = { ...f, ...next };
    setF(merged);
    setEditing(null);
    if (keys.length === 0) return;
    setSaving(true);
    // Send ONLY the field(s) that changed — updateTask does partial updates, so
    // untouched fields (instructions, links, …) are never overwritten. Status is
    // managed separately by the StatusDropdown, so it's never in this payload.
    const payload: Record<string, string> = {};
    for (const k of keys) payload[k] = merged[k] ?? "";
    const res = await postAction(`/api/hr/tasks/${task.id}`, payload);
    setSaving(false);
    if (!res.ok) window.alert(res.error ?? "Update failed");
    router.refresh();
  }

  return (
    <div className="surface" style={{ padding: "22px 24px", borderRadius: "var(--radius-card)" }}>
      {/* ── Editable title ──────────────────────────────────────── */}
      {editing === "title" ? (
        <input
          autoFocus
          defaultValue={f.title}
          onBlur={(e) => commit({ title: e.target.value.trim() || f.title })}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
            if (e.key === "Escape") setEditing(null);
          }}
          style={{ ...editorInput, fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-2xl)", letterSpacing: "-.02em", marginBottom: 14 }}
        />
      ) : (
        <h1
          onClick={() => setEditing("title")}
          title="Click to edit"
          className="editable"
          style={{ margin: "0 0 14px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-2xl)", letterSpacing: "-.02em", color: "var(--color-navy-900)", cursor: "text" }}
        >
          {f.title}
        </h1>
      )}

      {/* ── status / priority controls ──────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <StatusDropdown taskId={task.id} current={task.status} />
        <FieldEditor
          isEditing={editing === "priority"}
          onEdit={() => setEditing("priority")}
          display={<PriorityBadge value={f.priority} />}
          editor={
            <select autoFocus value={f.priority} onChange={(e) => commit({ priority: e.target.value })} onBlur={() => setEditing(null)} style={{ ...editorInput, width: "auto" }}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          }
        />
        {blocked && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "var(--text-xs)", fontWeight: 600, color: "var(--color-error-dark)", background: "var(--color-error-light)", padding: "2px 9px", borderRadius: 999 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--color-error)" }} /> Blocked
          </span>
        )}
        {saving && <span className="small" style={{ color: "var(--color-text-tertiary)" }}>Saving…</span>}
      </div>

      {/* ── meta rows ───────────────────────────────────────────── */}
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <MetaRow label="Assigned to">
          <ReassignControl taskId={task.id} currentAssigneeId={task.assignedToId} currentName={task.assignedToName} assignees={assignees} />
        </MetaRow>
        <MetaRow label="Assigned by"><span>{task.assignedByName || "—"}</span></MetaRow>

        <MetaRow label="Strategy">
          <FieldEditor
            isEditing={editing === "strategy"}
            onEdit={() => setEditing("strategy")}
            display={<span>{taskStrategyLabel(f.strategy)}</span>}
            editor={
              <select autoFocus value={f.strategy} onChange={(e) => commit({ strategy: e.target.value })} onBlur={() => setEditing(null)} style={{ ...editorInput, width: "auto" }}>
                {STRATEGIES.map((s) => <option key={s} value={s}>{taskStrategyLabel(s)}</option>)}
              </select>
            }
          />
        </MetaRow>

        <MetaRow label="Due date">
          <FieldEditor
            isEditing={editing === "dueDate"}
            onEdit={() => setEditing("dueDate")}
            display={f.dueDate ? <DueChip date={new Date(f.dueDate)} status={task.status} /> : <span style={{ color: "var(--color-text-tertiary)" }}>— set a date</span>}
            editor={
              <input autoFocus type="date" defaultValue={f.dueDate} onChange={(e) => commit({ dueDate: e.target.value })} onBlur={() => setEditing(null)} style={{ ...editorInput, width: "auto" }} />
            }
          />
        </MetaRow>

        <MetaRow label="Client">
          {editing === "client" ? (
            <CommitOnBlur onCommit={() => commit({ client: f.client })}>
              <ClientSelect value={f.client} onChange={(v) => setF((p) => ({ ...p, client: v }))} clients={clients} />
            </CommitOnBlur>
          ) : (
            <Display onEdit={() => setEditing("client")}>{f.client || <span style={{ color: "var(--color-text-tertiary)" }}>— no client</span>}</Display>
          )}
        </MetaRow>

        {task.projectName && (
          <MetaRow label="Project">
            {task.projectId ? <a href={`/hr/projects/${task.projectId}`} style={{ color: "var(--color-sky-700)" }}>{task.projectName}</a> : <span>{task.projectName}</span>}
          </MetaRow>
        )}

        <MetaRow label="Links" align="flex-start">
          <FieldEditor
            isEditing={editing === "links"}
            onEdit={() => setEditing("links")}
            display={f.links ? <LinkChips links={f.links} /> : <span style={{ color: "var(--color-text-tertiary)" }}>— add links</span>}
            editor={
              <input autoFocus defaultValue={f.links} placeholder="Comma-separated URLs" onBlur={(e) => commit({ links: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditing(null); }} style={editorInput} />
            }
          />
        </MetaRow>
      </div>

      {/* ── Instructions (inline) ───────────────────────────────── */}
      <div style={{ marginTop: 18, paddingTop: 18, borderTop: "1px solid var(--color-border-subtle)" }}>
        <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 8 }}>Instructions</div>
        {editing === "instructions" ? (
          <textarea
            autoFocus
            defaultValue={f.instructions}
            onBlur={(e) => commit({ instructions: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); }}
            style={{ ...editorInput, minHeight: 120, resize: "vertical", lineHeight: 1.55 }}
          />
        ) : (
          <div
            onClick={() => setEditing("instructions")}
            title="Click to edit"
            className="editable"
            style={{ whiteSpace: "pre-wrap", lineHeight: 1.6, color: f.instructions ? "var(--color-text-secondary)" : "var(--color-text-tertiary)", cursor: "text", minHeight: 24, borderRadius: 8, padding: "4px 6px", margin: "-4px -6px" }}
          >
            {f.instructions || "Click to add instructions…"}
          </div>
        )}
      </div>
    </div>
  );
}

/** A label + value row; the value is the click-to-edit content. */
function MetaRow({ label, children, align = "center" }: { label: string; children: ReactNode; align?: string }) {
  return (
    <div style={{ display: "flex", gap: 16, alignItems: align, minHeight: 34 }}>
      <span style={{ width: 100, color: "var(--color-text-tertiary)", flexShrink: 0, fontSize: "var(--text-sm)", paddingTop: align === "flex-start" ? 6 : 0 }}>{label}</span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** Shows `display` until clicked, then swaps to `editor`. */
function FieldEditor({ isEditing, onEdit, display, editor }: { isEditing: boolean; onEdit: () => void; display: ReactNode; editor: ReactNode }) {
  if (isEditing) return <>{editor}</>;
  return <Display onEdit={onEdit}>{display}</Display>;
}

function Display({ children, onEdit }: { children: ReactNode; onEdit: () => void }) {
  return (
    <span onClick={onEdit} title="Click to edit" className="editable" style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", borderRadius: 8, padding: "3px 6px", margin: "-3px -6px", maxWidth: "100%" }}>
      {children}
    </span>
  );
}

/** Wrapper that fires onCommit when focus leaves its subtree (for compound widgets like ClientSelect). */
function CommitOnBlur({ children, onCommit }: { children: ReactNode; onCommit: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      style={{ outline: "none" }}
      onBlur={(e) => {
        // Only commit when focus actually leaves the wrapper (onBlur bubbles
        // from the inner select/input via focusout).
        if (!ref.current?.contains(e.relatedTarget as Node)) onCommit();
      }}
    >
      {children}
    </div>
  );
}
