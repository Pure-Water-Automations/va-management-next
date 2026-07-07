"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { nextOption } from "@/lib/services/fields";

export type FieldPill = {
  id: string;
  name: string;
  type: "TEXT" | "SELECT" | "DATE" | "PERSON";
  options: string[];
  clientVisible: boolean;
  value: string | null;
};

const pillBase: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 7,
  height: 30,
  padding: "0 13px",
  borderRadius: 999,
  border: "1px solid var(--color-border-subtle)",
  background: "var(--color-surface)",
  fontSize: "var(--text-sm)",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const nameLabel: React.CSSProperties = {
  color: "var(--color-text-tertiary)",
  fontWeight: 600,
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

/** The 👁 marker on client-visible pills (design: "fields your team chose to share"). */
function EyeIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55, flex: "none" }} aria-label="Visible in client portal">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

/**
 * Property-pill row from the OS Hub design: each custom field renders as a
 * pill (NAME · value). Click a SELECT pill to cycle its options; click any
 * other pill to edit inline. "+ Add field" opens the create popover.
 */
export function PropertyPills({
  projectId,
  fields,
  canEdit,
}: {
  projectId: string;
  fields: FieldPill[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<FieldPill["type"]>("TEXT");
  const [newOptions, setNewOptions] = useState("");
  const [newClientVisible, setNewClientVisible] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(fieldId: string, value: string) {
    setBusyId(fieldId);
    const res = await postAction("/api/hr/fields/set-value", { fieldId, projectId, value });
    setBusyId(null);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to save");
      return;
    }
    setEditing(null);
    router.refresh();
  }

  function onPillClick(f: FieldPill) {
    if (!canEdit || busyId) return;
    if (f.type === "SELECT" && f.options.length > 0) {
      void save(f.id, nextOption(f.options, f.value) ?? "");
    } else {
      setEditing({ id: f.id, value: f.value ?? "" });
    }
  }

  async function addField() {
    if (!newName.trim() || saving) return;
    setSaving(true);
    const res = await postAction("/api/hr/fields", {
      name: newName,
      type: newType,
      projectId,
      options: newType === "SELECT" ? newOptions : undefined,
      clientVisible: newClientVisible,
    });
    setSaving(false);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to add field");
      return;
    }
    setAddOpen(false);
    setNewName("");
    setNewType("TEXT");
    setNewOptions("");
    setNewClientVisible(false);
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", position: "relative", marginBottom: 18 }}>
      {fields.map((f) =>
        editing?.id === f.id ? (
          <input
            key={f.id}
            autoFocus
            aria-label={`Edit ${f.name}`}
            type={f.type === "DATE" ? "date" : "text"}
            value={editing.value}
            onChange={(e) => setEditing({ id: f.id, value: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save(f.id, editing.value);
              if (e.key === "Escape") setEditing(null);
            }}
            onBlur={() => void save(f.id, editing.value)}
            style={{
              height: 30,
              padding: "0 13px",
              borderRadius: 999,
              border: "1px solid var(--color-sky-400, #4DC4E8)",
              boxShadow: "0 0 0 3px rgba(77,196,232,.2)",
              fontSize: "var(--text-sm)",
              width: 150,
            }}
          />
        ) : (
          <button
            key={f.id}
            onClick={() => onPillClick(f)}
            disabled={busyId === f.id}
            title={
              f.type === "SELECT"
                ? `Click to cycle: ${f.options.join(" → ") || "no options yet"}`
                : canEdit
                  ? "Click to edit"
                  : undefined
            }
            style={{ ...pillBase, cursor: canEdit ? "pointer" : "default", opacity: busyId === f.id ? 0.6 : 1 }}
          >
            <span style={nameLabel}>{f.name}</span>
            <span style={{ color: f.value ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}>
              {f.value ?? "—"}
            </span>
            {f.clientVisible && <EyeIcon />}
          </button>
        ),
      )}

      {canEdit && (
        <button
          onClick={() => setAddOpen((v) => !v)}
          style={{
            ...pillBase,
            border: "1px dashed var(--color-sky-400, #4DC4E8)",
            background: "transparent",
            color: "var(--color-sky-600, #1d9cc7)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          + Add field
        </button>
      )}

      {addOpen && (
        <div
          style={{
            position: "absolute",
            top: 38,
            left: 0,
            zIndex: 50,
            background: "var(--color-surface)",
            border: "1px solid var(--color-border)",
            borderRadius: 16,
            boxShadow: "var(--shadow-lg)",
            padding: 16,
            width: 280,
          }}
        >
          <div style={{ fontWeight: 600, fontSize: "var(--text-base)", marginBottom: 10 }}>New field</div>
          <input
            placeholder="Field name — e.g. Phase"
            value={newName}
            autoFocus
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void addField()}
            style={{ width: "100%", height: 38, padding: "0 12px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: "var(--text-sm)", marginBottom: 8 }}
          />
          <select
            aria-label="Field type"
            value={newType}
            onChange={(e) => setNewType(e.target.value as FieldPill["type"])}
            style={{ width: "100%", height: 38, padding: "0 10px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: "var(--text-sm)", background: "var(--color-surface)", marginBottom: 8 }}
          >
            <option value="TEXT">Text</option>
            <option value="SELECT">Select</option>
            <option value="DATE">Date</option>
            <option value="PERSON">Person</option>
          </select>
          {newType === "SELECT" && (
            <input
              placeholder="Options, comma-separated"
              value={newOptions}
              onChange={(e) => setNewOptions(e.target.value)}
              style={{ width: "100%", height: 38, padding: "0 12px", borderRadius: 12, border: "1px solid var(--color-border)", fontSize: "var(--text-sm)", marginBottom: 8 }}
            />
          )}
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", marginBottom: 8, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={newClientVisible}
              onChange={(e) => setNewClientVisible(e.target.checked)}
              style={{ width: 15, height: 15 }}
            />
            Visible in client portal
          </label>
          <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginBottom: 12 }}>
            Shows as a pill here and a column in the task table. Scoped to this project.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button
              onClick={() => setAddOpen(false)}
              style={{ height: 34, padding: "0 14px", borderRadius: 999, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer" }}
            >
              Cancel
            </button>
            <button
              onClick={() => void addField()}
              disabled={saving || !newName.trim()}
              style={{ height: 34, padding: "0 16px", borderRadius: 999, border: "none", background: "var(--color-navy-900, #132272)", color: "#fff", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer", opacity: saving ? 0.7 : 1 }}
            >
              {saving ? "Adding…" : "Add field"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
