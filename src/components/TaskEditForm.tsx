"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { ClientSelect } from "@/components/ClientSelect";

const STRATEGIES = [
  "Create",
  "Research",
  "Automate",
  "Communicate",
  "Plan",
  "Delegate",
  "Fix",
  "TechSupport",
  "Simplify",
  "Recurring",
] as const;

const STATUSES = ["NotStarted", "InProgress", "Done", "Blocked"] as const;

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

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={labelStyle}>{text}</label>
      {children}
    </div>
  );
}

export type TaskEditFormTask = {
  id: string;
  title: string;
  instructions: string | null;
  strategy: string;
  priority: string;
  status: string;
  client: string | null;
  dueDate: string | null;
  links: string | null;
};

export function TaskEditForm({ task, clients }: { task: TaskEditFormTask; clients: string[] }) {
  const router = useRouter();

  const [title, setTitle] = useState(task.title);
  const [instructions, setInstructions] = useState(task.instructions ?? "");
  const [strategy, setStrategy] = useState(task.strategy);
  const [priority, setPriority] = useState(task.priority);
  const [status, setStatus] = useState(task.status);
  const [client, setClient] = useState(task.client ?? "");
  const [dueDate, setDueDate] = useState(task.dueDate ?? "");
  const [links, setLinks] = useState(task.links ?? "");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!title.trim()) {
      window.alert("Title is required.");
      return;
    }
    setLoading(true);
    const res = await postAction(`/api/hr/tasks/${task.id}`, {
      title,
      instructions: instructions || "",
      strategy,
      priority,
      status,
      client: client || "",
      dueDate: dueDate || "",
      links: links || "",
    });
    setLoading(false);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to update task");
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="Title *">
        <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
      </Field>

      <Field label="Instructions">
        <textarea
          style={{ ...input, minHeight: 110, resize: "vertical" }}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </Field>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Strategy">
          <select style={input} value={strategy} onChange={(e) => setStrategy(e.target.value)}>
            {STRATEGIES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Priority">
          <select style={input} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </select>
        </Field>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Field label="Status">
          <select style={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
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
          Save Changes
        </Button>
      </div>
    </div>
  );
}
