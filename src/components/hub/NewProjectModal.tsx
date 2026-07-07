"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";

type Option = { id: string; label: string };

/**
 * Design's "New Project" modal: creates via the existing createProject API and
 * jumps straight into the new hub (its Overview page seeds from Description).
 */
export function NewProjectModal({
  owners,
  clients,
  meId,
}: {
  owners: Option[];
  clients: string[];
  meId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: "",
    description: "",
    status: "Planning",
    type: "Project",
    priority: "Medium",
    ownerId: meId,
    client: "",
    dueDate: "",
    links: "",
  });

  function set<K extends keyof typeof f>(k: K, v: string) {
    setF((prev) => ({ ...prev, [k]: v }));
  }

  async function create() {
    if (!f.name.trim() || busy) return;
    setBusy(true);
    const res = await postAction("/api/hr/projects", {
      name: f.name,
      description: f.description || undefined,
      status: f.status,
      type: f.type,
      priority: f.priority,
      ownerId: f.ownerId,
      client: f.client || undefined,
      dueDate: f.dueDate || undefined,
      links: f.links || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to create project");
      return;
    }
    const project = res.result as { id: string };
    setOpen(false);
    router.push(`/hr/projects/${project.id}`);
    router.refresh();
  }

  const field: React.CSSProperties = {
    width: "100%",
    height: 38,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid var(--color-border)",
    fontSize: "var(--text-sm)",
    background: "var(--color-surface)",
  };
  const label: React.CSSProperties = {
    display: "block",
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: ".04em",
    color: "var(--color-text-tertiary)",
    margin: "12px 0 4px",
  };

  return (
    <>
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        + New Project
      </button>
      {open && (
        <>
          <div
            onClick={() => setOpen(false)}
            style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(0,0,0,.45)" }}
          />
          <div
            role="dialog"
            aria-label="New project"
            style={{
              position: "fixed",
              top: "8vh",
              left: "50%",
              transform: "translateX(-50%)",
              width: 520,
              maxWidth: "94vw",
              maxHeight: "84vh",
              overflowY: "auto",
              zIndex: 81,
              background: "var(--color-surface, #fff)",
              border: "1px solid var(--color-border)",
              borderRadius: 20,
              boxShadow: "var(--shadow-lg)",
              padding: 24,
            }}
          >
            <h2 style={{ margin: 0, fontSize: "var(--text-xl)", color: "var(--color-navy-900, #0f1c5e)" }}>
              New Project
            </h2>

            <label style={label}>Name *</label>
            {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
            <input autoFocus value={f.name} onChange={(e) => set("name", e.target.value)} style={field} placeholder="e.g. BFC onboarding" />

            <label style={label}>Description</label>
            <textarea
              value={f.description}
              onChange={(e) => set("description", e.target.value)}
              rows={2}
              placeholder="Becomes the first line of the project's hub page"
              style={{ ...field, height: "auto", padding: "8px 12px", resize: "vertical" }}
            />

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              <div>
                <label style={label}>Status</label>
                <select value={f.status} onChange={(e) => set("status", e.target.value)} style={field}>
                  {["Planning", "Active", "Done", "Paused"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Type</label>
                <select value={f.type} onChange={(e) => set("type", e.target.value)} style={field}>
                  {["Project", "Event", "Recurring", "Report"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Priority</label>
                <select value={f.priority} onChange={(e) => set("priority", e.target.value)} style={field}>
                  {["Low", "Medium", "High"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={label}>Owner</label>
                <select value={f.ownerId} onChange={(e) => set("ownerId", e.target.value)} style={field}>
                  {owners.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={label}>Client</label>
                <select value={f.client} onChange={(e) => set("client", e.target.value)} style={field}>
                  <option value="">None (internal)</option>
                  {clients.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={label}>Due date</label>
                <input type="date" value={f.dueDate} onChange={(e) => set("dueDate", e.target.value)} style={field} />
              </div>
              <div>
                <label style={label}>Links</label>
                <input
                  value={f.links}
                  onChange={(e) => set("links", e.target.value)}
                  placeholder="Comma-separated URLs"
                  style={field}
                />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 20 }}>
              <button
                onClick={() => setOpen(false)}
                style={{ height: 38, padding: "0 16px", borderRadius: 999, border: "1px solid var(--color-border)", background: "var(--color-surface)", color: "var(--color-text-secondary)", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={() => void create()}
                disabled={busy || !f.name.trim()}
                style={{ height: 38, padding: "0 18px", borderRadius: 999, border: "none", background: "var(--color-navy-900, #132272)", color: "#fff", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer", opacity: busy ? 0.7 : 1 }}
              >
                {busy ? "Creating…" : "Create Project"}
              </button>
            </div>
          </div>
        </>
      )}
    </>
  );
}
