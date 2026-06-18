"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

type Assignee = { id: string; name: string | null; email: string };
type ContextCard = { id: string; source: string; title: string; snippet: string; link?: string; accepted: boolean };
type TaskCard = {
  id: string;
  title: string;
  instructions?: string;
  priority: string;
  accepted: boolean;
  expanded: boolean;
  assignedToId: string;
  dueDate: string;
};

const input: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "6px 8px",
  font: "inherit",
  background: "var(--color-surface)",
  width: "100%",
  boxSizing: "border-box",
};

export function EnhanceModal({
  projectId,
  projectName,
  assignees,
  onClose,
}: {
  projectId: string;
  projectName: string;
  assignees: Assignee[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [contexts, setContexts] = useState<ContextCard[]>([]);
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [notices, setNotices] = useState<string[]>([]);
  const [summary, setSummary] = useState("");
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/hr/projects/${projectId}/enhance`, { method: "POST" });
        if (!res.ok || !res.body) {
          setNotices((n) => [...n, "Couldn't reach Second Brain."]);
          setLoading(false);
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        // Parse the SSE text stream incrementally: events are separated by a blank line.
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const chunks = buffer.split("\n\n");
          buffer = chunks.pop() ?? "";
          for (const chunk of chunks) {
            const evMatch = chunk.match(/^event: (.+)$/m);
            const dataMatch = chunk.match(/^data: (.+)$/m);
            if (!evMatch || !dataMatch) continue;
            const ev = evMatch[1].trim();
            let data: Record<string, unknown>;
            try {
              data = JSON.parse(dataMatch[1]);
            } catch {
              continue;
            }
            if (cancelled) return;
            if (ev === "context") {
              setContexts((c) => [...c, { ...(data as unknown as ContextCard), accepted: true }]);
            } else if (ev === "tasks") {
              setSummary((data.contextSummary as string) ?? "");
              const incoming = (data.tasks as Record<string, unknown>[]) ?? [];
              setTasks(
                incoming.map((t) => ({
                  id: String(t.id),
                  title: String(t.title),
                  instructions: typeof t.instructions === "string" ? t.instructions : undefined,
                  priority: typeof t.priority === "string" ? t.priority : "Medium",
                  accepted: true,
                  expanded: false,
                  assignedToId: "",
                  dueDate: "",
                })),
              );
            } else if (ev === "error") {
              setNotices((n) => [...n, `${data.source}: ${data.message}`]);
            } else if (ev === "done") {
              setLoading(false);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setNotices((n) => [...n, "Second Brain request failed."]);
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const acceptedContextCount = contexts.filter((c) => c.accepted).length;
  const acceptedTaskCount = tasks.filter((t) => t.accepted).length;

  async function apply() {
    setApplying(true);
    const res = await postAction(`/api/hr/projects/${projectId}/enhance/apply`, {
      acceptedContext: contexts
        .filter((c) => c.accepted)
        .map(({ source, title, snippet, link }) => ({ source, title, snippet, link })),
      acceptedTasks: tasks
        .filter((t) => t.accepted)
        .map((t) => ({
          title: t.title,
          instructions: t.instructions,
          priority: t.priority,
          assignedToId: t.assignedToId || undefined,
          dueDate: t.dueDate || undefined,
          link: contexts[0]?.link,
        })),
    });
    setApplying(false);
    if (!res.ok) {
      window.alert(res.error ?? "Apply failed");
      return;
    }
    const r = res.result as { created: number; failed: { title: string; error: string }[] } | undefined;
    if (r?.failed?.length) {
      window.alert(
        `Added ${r.created} task(s). ${r.failed.length} failed:\n` +
          r.failed.map((f) => `- ${f.title}: ${f.error}`).join("\n"),
      );
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(16,24,32,.5)",
        backdropFilter: "blur(2px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: "var(--radius-card)",
          width: "min(960px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 70px rgba(16,24,32,.32)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
          <h2 style={{ margin: 0 }}>✨ Second Brain — {projectName}</h2>
          {loading && (
            <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
              Searching Notion, Drive, and meetings…
            </span>
          )}
          {summary && !loading && (
            <p className="small" style={{ margin: "6px 0 0", color: "var(--color-text-secondary)" }}>
              {summary}
            </p>
          )}
        </div>

        {notices.length > 0 && (
          <div
            style={{
              padding: "8px 20px",
              background: "var(--color-bg-secondary)",
              color: "var(--color-text-secondary)",
              fontSize: "var(--text-sm)",
            }}
          >
            {notices.map((n, i) => (
              <div key={i}>⚠ {n}</div>
            ))}
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 20, overflowY: "auto" }}>
          {/* Context column */}
          <div>
            <div className="small" style={{ fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 8 }}>
              CONTEXT FOUND
            </div>
            {contexts.length === 0 && !loading && (
              <p className="small" style={{ color: "var(--color-text-tertiary)" }}>
                No related context found.
              </p>
            )}
            {contexts.map((c) => (
              <div
                key={c.id}
                style={{
                  border: `1px solid ${c.accepted ? "var(--color-navy-500, #1b3a6b)" : "var(--color-border)"}`,
                  borderRadius: "var(--radius-input)",
                  padding: 10,
                  marginBottom: 8,
                }}
              >
                <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{c.title}</div>
                <div className="small" style={{ color: "var(--color-text-secondary)", marginTop: 2 }}>
                  {c.snippet}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, alignItems: "center" }}>
                  <Button
                    size="sm"
                    variant={c.accepted ? "primary" : "ghost"}
                    onClick={() =>
                      setContexts((cs) => cs.map((x) => (x.id === c.id ? { ...x, accepted: !x.accepted } : x)))
                    }
                  >
                    {c.accepted ? "✓ Accepted" : "Accept"}
                  </Button>
                  {c.link && (
                    <a
                      className="small"
                      href={c.link}
                      target="_blank"
                      rel="noreferrer"
                      style={{ color: "var(--color-text-tertiary)" }}
                    >
                      source
                    </a>
                  )}
                </div>
              </div>
            ))}
            {loading && (
              <div
                style={{
                  height: 48,
                  border: "1px dashed var(--color-border)",
                  borderRadius: "var(--radius-input)",
                  opacity: 0.5,
                }}
              />
            )}
          </div>

          {/* Tasks column */}
          <div>
            <div className="small" style={{ fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 8 }}>
              SUGGESTED TASKS
            </div>
            {tasks.length === 0 && !loading && (
              <p className="small" style={{ color: "var(--color-text-tertiary)" }}>
                No task suggestions.
              </p>
            )}
            {tasks.map((t) => (
              <div
                key={t.id}
                style={{
                  border: `1px solid ${t.accepted ? "var(--color-navy-500, #1b3a6b)" : "var(--color-border)"}`,
                  borderRadius: "var(--radius-input)",
                  padding: 10,
                  marginBottom: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{t.title}</div>
                  {t.instructions && (
                    <button
                      onClick={() => setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, expanded: !x.expanded } : x)))}
                      className="small"
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)" }}
                    >
                      {t.expanded ? "▲ details" : "▼ details"}
                    </button>
                  )}
                </div>
                {t.expanded && t.instructions && (
                  <div className="small" style={{ color: "var(--color-text-secondary)", margin: "4px 0 6px" }}>
                    {t.instructions}
                  </div>
                )}
                {/* Assignee + due date are always visible so an accepted task is never created unassigned. */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: 6 }}>
                  <select
                    style={{ ...input, borderColor: t.accepted && !t.assignedToId ? "var(--color-danger, #c62828)" : "var(--color-border)" }}
                    value={t.assignedToId}
                    onChange={(e) =>
                      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, assignedToId: e.target.value } : x)))
                    }
                  >
                    <option value="">Assign to…</option>
                    {assignees.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name ?? a.email}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    style={input}
                    value={t.dueDate}
                    onChange={(e) =>
                      setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, dueDate: e.target.value } : x)))
                    }
                  />
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <Button
                    size="sm"
                    variant={t.accepted ? "primary" : "ghost"}
                    onClick={() => setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, accepted: !x.accepted } : x)))}
                  >
                    {t.accepted ? "✓ Add" : "Skipped"}
                  </Button>
                </div>
              </div>
            ))}
            {loading && (
              <div
                style={{
                  height: 48,
                  border: "1px dashed var(--color-border)",
                  borderRadius: "var(--radius-input)",
                  opacity: 0.5,
                }}
              />
            )}
          </div>
        </div>

        <div
          style={{
            padding: "12px 20px",
            borderTop: "1px solid var(--color-border)",
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={applying}
            disabled={applying || (acceptedContextCount === 0 && acceptedTaskCount === 0)}
            onClick={apply}
          >
            Confirm selected ({acceptedContextCount + acceptedTaskCount})
          </Button>
        </div>
      </div>
    </div>
  );
}
