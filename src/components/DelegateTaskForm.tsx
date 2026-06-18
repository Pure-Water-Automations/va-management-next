"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { ClientSelect } from "@/components/ClientSelect";

type Va = { id: string; name: string | null; email: string; openTasks?: number };
type Project = { id: string; name: string };
type ResourceEntry = { notionPageId: string; title: string; url: string; category?: string };

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

const label: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.1em",
  color: "var(--color-text-tertiary)",
  fontWeight: 700,
};

function Field({ label: text, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label style={label}>{text}</label>
      {children}
    </div>
  );
}

function MultiSelect({
  items,
  selected,
  onToggle,
}: {
  items: ResourceEntry[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        maxHeight: 180,
        overflowY: "auto",
        border: "1px solid var(--color-border)",
        borderRadius: "var(--radius-input)",
        padding: 8,
      }}
    >
      {items.map((item) => (
        <label key={item.notionPageId} style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input
            type="checkbox"
            checked={selected.has(item.notionPageId)}
            onChange={() => onToggle(item.notionPageId)}
          />
          {item.title}
        </label>
      ))}
    </div>
  );
}

export function DelegateTaskForm({
  vas,
  projects,
  sops,
  trainings,
  tools,
  clients,
}: {
  vas: Va[];
  projects: Project[];
  sops: ResourceEntry[];
  trainings: ResourceEntry[];
  tools: ResourceEntry[];
  clients: string[];
}) {
  const router = useRouter();

  const [assignedToId, setAssignedToId] = useState("");
  const [title, setTitle] = useState("");
  const [instructions, setInstructions] = useState("");
  const [strategy, setStrategy] = useState<string>("Create");
  const [priority, setPriority] = useState("Medium");
  const [dueDate, setDueDate] = useState("");
  const [client, setClient] = useState("");
  const [projectId, setProjectId] = useState("");
  const [links, setLinks] = useState("");
  const [sopIds, setSopIds] = useState<Set<string>>(new Set());
  const [trainingIds, setTrainingIds] = useState<Set<string>>(new Set());
  const [toolIds, setToolIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function pick(items: ResourceEntry[], ids: Set<string>): ResourceEntry[] {
    return items.filter((i) => ids.has(i.notionPageId));
  }

  async function submit() {
    if (!title.trim() || !assignedToId) {
      window.alert("Title and assignee are required.");
      return;
    }
    setLoading(true);
    const res = await postAction("/api/hr/tasks", {
      title,
      instructions: instructions || undefined,
      strategy,
      priority,
      assignedToId,
      projectId: projectId || undefined,
      client: client || undefined,
      dueDate: dueDate || undefined,
      links: links || undefined,
      relatedSops: pick(sops, sopIds),
      relatedTrainings: pick(trainings, trainingIds),
      suggestedTools: pick(tools, toolIds),
    });
    setLoading(false);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to create task");
      return;
    }
    const task = res.result as { id?: string } | null;
    if (task?.id) {
      router.push(`/hr/tasks/${task.id}`);
    } else {
      router.push("/hr/tasks");
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Field label="Title *">
        <input style={input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Task title" />
      </Field>

      <Field label="Assign to *">
        <select style={input} value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
          <option value="">Select a VA… (sorted by who has the most bandwidth)</option>
          {vas.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name ?? v.email}
              {v.openTasks !== undefined ? ` · ${v.openTasks} open` : ""}
            </option>
          ))}
        </select>
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
        <Field label="Due date">
          <input style={input} type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </Field>
        <Field label="Client">
          <ClientSelect value={client} onChange={setClient} clients={clients} />
        </Field>
      </div>

      {projects.length > 0 && (
        <Field label="Link to project">
          <select style={input} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">No project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Instructions">
        <textarea
          style={{ ...input, minHeight: 110, resize: "vertical" }}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
        />
      </Field>

      <Field label="Links">
        <input style={input} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="Comma-separated URLs" />
      </Field>

      {sops.length > 0 && (
        <Field label="Related SOPs">
          <MultiSelect items={sops} selected={sopIds} onToggle={(id) => toggle(setSopIds, id)} />
        </Field>
      )}

      {trainings.length > 0 && (
        <Field label="Related Trainings">
          <MultiSelect items={trainings} selected={trainingIds} onToggle={(id) => toggle(setTrainingIds, id)} />
        </Field>
      )}

      {tools.length > 0 && (
        <Field label="Suggested Tools">
          <MultiSelect items={tools} selected={toolIds} onToggle={(id) => toggle(setToolIds, id)} />
        </Field>
      )}

      <div>
        <Button onClick={submit} loading={loading} disabled={loading} variant="primary">
          Assign Task + Send Email
        </Button>
      </div>
    </div>
  );
}
