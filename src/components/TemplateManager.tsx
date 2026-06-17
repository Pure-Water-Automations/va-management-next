"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { PriorityBadge } from "@/components/ui/task-format";

const TYPES = ["Project", "Event", "Recurring", "Report"] as const;
const PRIORITIES = ["Low", "Medium", "High"] as const;
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

type ProjectTemplate = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  priority: string;
  tasksJson: unknown;
  createdAt: string | Date;
};

type TaskTemplate = {
  id: string;
  name: string;
  title: string;
  instructions: string | null;
  strategy: string;
  priority: string;
  createdAt: string | Date;
};

type TaskRow = { title: string; strategy: string; priority: string };

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

function countTasks(tasksJson: unknown): number {
  return Array.isArray(tasksJson) ? tasksJson.length : 0;
}

export function TemplateManager({
  projectTemplates,
  taskTemplates,
}: {
  projectTemplates: ProjectTemplate[];
  taskTemplates: TaskTemplate[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  // Project-template create form
  const [pName, setPName] = useState("");
  const [pDescription, setPDescription] = useState("");
  const [pType, setPType] = useState("Project");
  const [pPriority, setPPriority] = useState("Medium");
  const [pTasks, setPTasks] = useState<TaskRow[]>([]);

  // Task-template create form
  const [tName, setTName] = useState("");
  const [tTitle, setTTitle] = useState("");
  const [tInstructions, setTInstructions] = useState("");
  const [tStrategy, setTStrategy] = useState("Create");
  const [tPriority, setTPriority] = useState("Medium");

  async function createProjectTemplate() {
    if (!pName.trim()) return window.alert("Template name is required.");
    setBusy("create-project");
    const tasks = pTasks.filter((t) => t.title.trim());
    const res = await postAction("/api/hr/templates", {
      kind: "project",
      name: pName,
      description: pDescription || undefined,
      type: pType,
      priority: pPriority,
      tasks,
    });
    setBusy(null);
    if (!res.ok) return window.alert(res.error ?? "Failed to create template");
    setPName("");
    setPDescription("");
    setPType("Project");
    setPPriority("Medium");
    setPTasks([]);
    router.refresh();
  }

  async function createTaskTemplate() {
    if (!tName.trim()) return window.alert("Template name is required.");
    if (!tTitle.trim()) return window.alert("Task title is required.");
    setBusy("create-task");
    const res = await postAction("/api/hr/templates", {
      kind: "task",
      name: tName,
      title: tTitle,
      instructions: tInstructions || undefined,
      strategy: tStrategy,
      priority: tPriority,
    });
    setBusy(null);
    if (!res.ok) return window.alert(res.error ?? "Failed to create template");
    setTName("");
    setTTitle("");
    setTInstructions("");
    setTStrategy("Create");
    setTPriority("Medium");
    router.refresh();
  }

  async function useTemplate(kind: "project" | "task", id: string, name?: string) {
    setBusy(`use-${id}`);
    const res = await postAction("/api/hr/templates/instantiate", { kind, id, name });
    setBusy(null);
    if (!res.ok) return window.alert(res.error ?? "Failed to use template");
    const result = res.result as { projectId?: string; taskId?: string } | null;
    if (result?.projectId) router.push(`/hr/projects/${result.projectId}`);
    else if (result?.taskId) router.push(`/va/tasks/${result.taskId}`);
    else router.refresh();
  }

  async function deleteTemplate(kind: "project" | "task", id: string) {
    if (!window.confirm("Delete this template?")) return;
    setBusy(`del-${id}`);
    const res = await postAction("/api/hr/templates/delete", { kind, id });
    setBusy(null);
    if (!res.ok) return window.alert(res.error ?? "Failed to delete template");
    router.refresh();
  }

  function addTaskRow() {
    setPTasks((rows) => [...rows, { title: "", strategy: "Create", priority: "Medium" }]);
  }
  function updateTaskRow(i: number, patch: Partial<TaskRow>) {
    setPTasks((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function removeTaskRow(i: number) {
    setPTasks((rows) => rows.filter((_, idx) => idx !== i));
  }

  const deleteX: React.CSSProperties = {
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: "var(--color-text-tertiary)",
    fontSize: 18,
    lineHeight: 1,
    padding: "0 4px",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 32, marginTop: 24 }}>
      {/* ── Project templates ─────────────────────────────────────────── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: "var(--text-md)" }}>Project Templates</h2>

        {projectTemplates.length === 0 ? (
          <p className="small" style={{ color: "var(--color-text-tertiary)" }}>
            No project templates yet.
          </p>
        ) : (
          projectTemplates.map((t) => (
            <Card key={t.id} padding={20}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>{t.name}</div>
                  {t.description && (
                    <div className="small" style={{ marginTop: 4, color: "var(--color-text-secondary)" }}>
                      {t.description}
                    </div>
                  )}
                  <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge variant="primary" size="sm">
                      {t.type}
                    </Badge>
                    <PriorityBadge value={t.priority} />
                    <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
                      {countTasks(t.tasksJson)} task(s)
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={busy === `use-${t.id}`}
                    disabled={!!busy}
                    onClick={() => useTemplate("project", t.id)}
                  >
                    Use
                  </Button>
                  <button
                    style={deleteX}
                    title="Delete template"
                    aria-label="Delete template"
                    disabled={!!busy}
                    onClick={() => deleteTemplate("project", t.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}

        <Card padding={20}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>New project template</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <Field label="Name *">
              <input
                style={input}
                value={pName}
                onChange={(e) => setPName(e.target.value)}
                placeholder="e.g. New client onboarding"
              />
            </Field>
            <Field label="Description">
              <textarea
                style={{ ...input, minHeight: 70, resize: "vertical" }}
                value={pDescription}
                onChange={(e) => setPDescription(e.target.value)}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Type">
                <select style={input} value={pType} onChange={(e) => setPType(e.target.value)}>
                  {TYPES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select style={input} value={pPriority} onChange={(e) => setPPriority(e.target.value)}>
                  {PRIORITIES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <label style={labelStyle}>Tasks</label>
              {pTasks.map((row, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 140px 120px 28px", gap: 8, alignItems: "center" }}>
                  <input
                    style={input}
                    value={row.title}
                    onChange={(e) => updateTaskRow(i, { title: e.target.value })}
                    placeholder="Task title"
                  />
                  <select style={input} value={row.strategy} onChange={(e) => updateTaskRow(i, { strategy: e.target.value })}>
                    {STRATEGIES.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                  <select style={input} value={row.priority} onChange={(e) => updateTaskRow(i, { priority: e.target.value })}>
                    {PRIORITIES.map((x) => (
                      <option key={x} value={x}>
                        {x}
                      </option>
                    ))}
                  </select>
                  <button style={deleteX} title="Remove task" aria-label="Remove task" onClick={() => removeTaskRow(i)}>
                    ×
                  </button>
                </div>
              ))}
              <div>
                <Button size="sm" variant="ghost" onClick={addTaskRow}>
                  + Add task
                </Button>
              </div>
            </div>

            <div>
              <Button
                variant="primary"
                loading={busy === "create-project"}
                disabled={!!busy}
                onClick={createProjectTemplate}
              >
                Create project template
              </Button>
            </div>
          </div>
        </Card>
      </section>

      {/* ── Task templates ────────────────────────────────────────────── */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <h2 style={{ margin: 0, fontSize: "var(--text-md)" }}>Task Templates</h2>

        {taskTemplates.length === 0 ? (
          <p className="small" style={{ color: "var(--color-text-tertiary)" }}>
            No task templates yet.
          </p>
        ) : (
          taskTemplates.map((t) => (
            <Card key={t.id} padding={20}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: "var(--text-base)" }}>{t.name}</div>
                  <div className="small" style={{ marginTop: 4, color: "var(--color-text-secondary)" }}>
                    {t.title}
                  </div>
                  <div style={{ marginTop: 8, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge variant="sky" size="sm">
                      {t.strategy}
                    </Badge>
                    <PriorityBadge value={t.priority} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <Button
                    size="sm"
                    variant="primary"
                    loading={busy === `use-${t.id}`}
                    disabled={!!busy}
                    onClick={() => useTemplate("task", t.id)}
                  >
                    Use
                  </Button>
                  <button
                    style={deleteX}
                    title="Delete template"
                    aria-label="Delete template"
                    disabled={!!busy}
                    onClick={() => deleteTemplate("task", t.id)}
                  >
                    ×
                  </button>
                </div>
              </div>
            </Card>
          ))
        )}

        <Card padding={20}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>New task template</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Template name *">
                <input
                  style={input}
                  value={tName}
                  onChange={(e) => setTName(e.target.value)}
                  placeholder="e.g. Weekly report"
                />
              </Field>
              <Field label="Task title *">
                <input
                  style={input}
                  value={tTitle}
                  onChange={(e) => setTTitle(e.target.value)}
                  placeholder="Title of the created task"
                />
              </Field>
            </div>
            <Field label="Instructions">
              <textarea
                style={{ ...input, minHeight: 70, resize: "vertical" }}
                value={tInstructions}
                onChange={(e) => setTInstructions(e.target.value)}
              />
            </Field>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <Field label="Strategy">
                <select style={input} value={tStrategy} onChange={(e) => setTStrategy(e.target.value)}>
                  {STRATEGIES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select style={input} value={tPriority} onChange={(e) => setTPriority(e.target.value)}>
                  {PRIORITIES.map((x) => (
                    <option key={x} value={x}>
                      {x}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div>
              <Button
                variant="primary"
                loading={busy === "create-task"}
                disabled={!!busy}
                onClick={createTaskTemplate}
              >
                Create task template
              </Button>
            </div>
          </div>
        </Card>
      </section>
    </div>
  );
}
