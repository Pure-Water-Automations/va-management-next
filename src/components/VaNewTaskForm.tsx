"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { taskStrategyLabel } from "@/lib/labels";

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

/** Simplified self-assign form: a VA creates a task for themselves (no assignee
 *  picker, no project/SOP/training/tool pickers — always self-assigned). */
export function VaNewTaskForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [strategy, setStrategy] = useState<string>("Create");
  const [priority, setPriority] = useState("Medium");
  const [dueDate, setDueDate] = useState("");
  const [links, setLinks] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!title.trim()) {
      window.alert("Title is required.");
      return;
    }
    setLoading(true);
    const res = await postAction("/api/va/tasks", {
      title,
      instructions: instructions || undefined,
      strategy,
      priority,
      dueDate: dueDate || undefined,
      links: links || undefined,
    });
    setLoading(false);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to create task");
      return;
    }
    router.push("/va/tasks");
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
                {taskStrategyLabel(s)}
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

      <Field label="Due date">
        <input style={input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
      </Field>

      <Field label="Links">
        <input style={input} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="Comma-separated URLs" />
      </Field>

      <div>
        <Button onClick={submit} loading={loading} disabled={loading} variant="primary">
          Add task
        </Button>
      </div>
    </div>
  );
}
