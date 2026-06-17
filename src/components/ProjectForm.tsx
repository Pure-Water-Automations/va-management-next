"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { ClientSelect } from "@/components/ClientSelect";

type User = { id: string; name: string | null; email: string };

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  client: string | null;
  ownerId: string;
  dueDate: string | null;
  links: string | null;
};

const STATUSES = ["Planning", "Active", "Done", "Paused"] as const;
const TYPES = ["Project", "Event", "Recurring", "Report"] as const;
const PRIORITIES = ["Low", "Medium", "High"] as const;

const input: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "10px 12px",
  font: "inherit",
  background: "var(--color-surface)",
  width: "100%",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--color-text-tertiary)",
  fontWeight: 700,
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

export function ProjectForm({ users, project, clients }: { users: User[]; project?: Project; clients: string[] }) {
  const router = useRouter();

  const [name, setName] = useState(project?.name ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState(project?.status ?? "Planning");
  const [type, setType] = useState(project?.type ?? "Project");
  const [priority, setPriority] = useState(project?.priority ?? "Medium");
  const [client, setClient] = useState(project?.client ?? "");
  const [ownerId, setOwnerId] = useState(project?.ownerId ?? "");
  const [dueDate, setDueDate] = useState(project?.dueDate ?? "");
  const [links, setLinks] = useState(project?.links ?? "");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!name.trim()) {
      window.alert("Name is required.");
      return;
    }
    setLoading(true);
    const payload = {
      name,
      description: description || undefined,
      status,
      type,
      priority,
      client: client || undefined,
      ownerId: ownerId || undefined,
      dueDate: dueDate || undefined,
      links: links || undefined,
    };
    const url = project ? `/api/hr/projects/${project.id}` : "/api/hr/projects";
    const res = await postAction(url, payload);
    setLoading(false);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to save project");
      return;
    }
    const saved = res.result as { id?: string } | null;
    if (saved?.id) {
      router.push(`/hr/projects/${saved.id}`);
    } else {
      router.push("/hr/projects");
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="Name *">
        <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Project name" />
      </Field>

      <Field label="Description">
        <textarea
          style={{ ...input, minHeight: 110, resize: "vertical" }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
        <Field label="Status">
          <select style={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Type">
          <select style={input} value={type} onChange={(e) => setType(e.target.value)}>
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select style={input} value={priority} onChange={(e) => setPriority(e.target.value)}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Owner">
          <select style={input} value={ownerId} onChange={(e) => setOwnerId(e.target.value)}>
            <option value="">Default (you)</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name ?? u.email}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date">
          <input style={input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
      </div>

      <Field label="Client">
        <ClientSelect value={client} onChange={setClient} clients={clients} />
      </Field>

      <Field label="Links">
        <input style={input} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="Comma-separated URLs" />
      </Field>

      <div>
        <Button onClick={submit} loading={loading} disabled={loading} variant="primary">
          {project ? "Save Changes" : "Create Project"}
        </Button>
      </div>
    </div>
  );
}
