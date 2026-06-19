"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

type Assignee = { id: string; name: string | null; email: string };
type Source = { title: string; link?: string; kind?: string };
type TaskCard = {
  id: string;
  title: string;
  instructions?: string;
  priority: string;
  accepted: boolean;
  assignedToId: string;
  dueDate: string;
};
type Phase = "input" | "searching" | "questions" | "findings" | "error";

const input: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "8px 10px",
  font: "inherit",
  background: "var(--color-surface)",
  width: "100%",
  boxSizing: "border-box",
};

// --- minimal, XSS-safe markdown -> HTML (escape first, then inject only known tags) ---
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function inlineMd(s: string): string {
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noreferrer">${t}</a>`);
  s = s.replace(/(^|[^"=>])(https?:\/\/[^\s<)]+)/g, (_m, p, u) => `${p}<a href="${u}" target="_blank" rel="noreferrer">${u}</a>`);
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return s;
}
function mdToHtml(md: string): string {
  const lines = escapeHtml(md).split("\n");
  const out: string[] = [];
  let inList = false;
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (/^#{1,6}\s+/.test(line)) {
      closeList();
      out.push(`<div style="font-weight:700;margin:10px 0 4px">${inlineMd(line.replace(/^#{1,6}\s+/, ""))}</div>`);
    } else if (/^>\s?/.test(line)) {
      closeList();
      out.push(
        `<blockquote style="margin:6px 0;padding-left:10px;border-left:3px solid var(--color-border);color:var(--color-text-secondary)">${inlineMd(line.replace(/^>\s?/, ""))}</blockquote>`,
      );
    } else if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        out.push('<ul style="margin:4px 0;padding-left:18px">');
        inList = true;
      }
      out.push(`<li>${inlineMd(line.replace(/^[-*]\s+/, ""))}</li>`);
    } else if (line.trim() === "") {
      closeList();
      out.push('<div style="height:6px"></div>');
    } else {
      closeList();
      out.push(`<div>${inlineMd(line)}</div>`);
    }
  }
  closeList();
  return out.join("");
}

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
  const [phase, setPhase] = useState<Phase>("input");
  const [prompt, setPrompt] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [brief, setBrief] = useState("");
  const [sources, setSources] = useState<Source[]>([]);
  const [tasks, setTasks] = useState<TaskCard[]>([]);
  const [saveBrief, setSaveBrief] = useState(true);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);

  async function runSearch(promptText: string, answersText?: string) {
    setPhase("searching");
    setSteps([]);
    setError("");
    try {
      const res = await fetch(`/api/hr/projects/${projectId}/enhance`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: promptText || undefined, answers: answersText || undefined }),
      });
      if (!res.ok || !res.body) {
        setError("Couldn't reach Second Brain.");
        setPhase("error");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const ev = chunk.match(/^event: (.+)$/m)?.[1]?.trim();
          const dataRaw = chunk.match(/^data: (.+)$/m)?.[1];
          if (!ev || !dataRaw) continue;
          let data: Record<string, unknown>;
          try {
            data = JSON.parse(dataRaw);
          } catch {
            continue;
          }
          if (ev === "step") {
            setSteps((s) => [...s, String(data.label ?? "")]);
          } else if (ev === "questions") {
            setQuestions((data.questions as string[]) ?? []);
            setAnswers({});
            setPhase("questions");
          } else if (ev === "findings") {
            setBrief((data.brief as string) ?? "");
            setSources((data.sources as Source[]) ?? []);
            setTasks(
              ((data.tasks as Record<string, unknown>[]) ?? []).map((t) => ({
                id: String(t.id),
                title: String(t.title),
                instructions: typeof t.instructions === "string" ? t.instructions : undefined,
                priority: typeof t.priority === "string" ? t.priority : "Medium",
                accepted: true,
                assignedToId: "",
                dueDate: "",
              })),
            );
            setPhase("findings");
          } else if (ev === "error") {
            setError(String(data.message ?? "AI search failed."));
            setPhase("error");
          }
        }
      }
    } catch {
      setError("Second Brain request failed.");
      setPhase("error");
    }
  }

  function submitAnswers() {
    const answersText = questions
      .map((q, i) => (answers[i]?.trim() ? `Q: ${q}\nA: ${answers[i].trim()}` : null))
      .filter(Boolean)
      .join("\n\n");
    runSearch(prompt, answersText);
  }

  const acceptedTaskCount = tasks.filter((t) => t.accepted).length;

  async function apply() {
    setApplying(true);
    const res = await postAction(`/api/hr/projects/${projectId}/enhance/apply`, {
      brief: saveBrief ? brief : "",
      acceptedTasks: tasks
        .filter((t) => t.accepted)
        .map((t) => ({
          title: t.title,
          instructions: t.instructions,
          priority: t.priority,
          assignedToId: t.assignedToId || undefined,
          dueDate: t.dueDate || undefined,
        })),
    });
    setApplying(false);
    if (!res.ok) {
      window.alert(res.error ?? "Apply failed");
      return;
    }
    const r = res.result as { created: number; failed: { title: string; error: string }[] } | undefined;
    if (r?.failed?.length) {
      window.alert(`Added ${r.created} task(s). ${r.failed.length} failed:\n` + r.failed.map((f) => `- ${f.title}: ${f.error}`).join("\n"));
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
          width: "min(820px, 100%)",
          maxHeight: "90vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 70px rgba(16,24,32,.32)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
          <h2 style={{ margin: 0 }}>✨ Second Brain — {projectName}</h2>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>
          {/* INPUT */}
          {phase === "input" && (
            <>
              <p className="small" style={{ color: "var(--color-text-secondary)", marginTop: 0 }}>
                I&apos;ll search the team&apos;s notes, meetings, and Drive, then write up what we know about this project and
                suggest tasks. Add anything specific you want help with (optional):
              </p>
              <textarea
                style={{ ...input, minHeight: 80, resize: "vertical" }}
                placeholder="e.g. find past Northeast Assemblies and what worked, and help me plan the agenda"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button variant="primary" onClick={() => runSearch(prompt)}>
                  ✨ Search Second Brain
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {/* SEARCHING */}
          {phase === "searching" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--color-navy-500, #1b3a6b)" }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 12,
                    height: 12,
                    border: "2px solid var(--color-border)",
                    borderTopColor: "var(--color-navy-500, #1b3a6b)",
                    borderRadius: "50%",
                    animation: "spin 0.7s linear infinite",
                  }}
                />
                Researching the Second Brain…
              </div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {steps.map((s, i) => (
                  <div key={i} className="small" style={{ color: "var(--color-text-secondary)" }}>
                    {i === steps.length - 1 ? "▸ " : "✓ "}
                    {s}
                  </div>
                ))}
                {steps.length === 0 && (
                  <div className="small" style={{ color: "var(--color-text-tertiary)" }}>
                    Planning searches…
                  </div>
                )}
              </div>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {/* QUESTIONS */}
          {phase === "questions" && (
            <div>
              <p className="small" style={{ color: "var(--color-text-secondary)", marginTop: 0 }}>
                A couple of quick questions so I can search well:
              </p>
              {questions.map((q, i) => (
                <div key={i} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: "var(--text-sm)", marginBottom: 4 }}>{q}</div>
                  <input
                    style={input}
                    value={answers[i] ?? ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [i]: e.target.value }))}
                  />
                </div>
              ))}
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <Button variant="primary" onClick={submitAnswers}>
                  Continue
                </Button>
                <Button variant="ghost" onClick={() => runSearch(prompt, "")}>
                  Skip — just search
                </Button>
              </div>
            </div>
          )}

          {/* ERROR */}
          {phase === "error" && (
            <div>
              <p style={{ color: "var(--color-danger, #c62828)" }}>⚠ {error}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="primary" onClick={() => runSearch(prompt)}>
                  Try again
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Close
                </Button>
              </div>
            </div>
          )}

          {/* FINDINGS */}
          {phase === "findings" && (
            <div>
              {brief ? (
                <>
                  <div
                    style={{ fontSize: "var(--text-sm)", lineHeight: 1.55 }}
                    dangerouslySetInnerHTML={{ __html: mdToHtml(brief) }}
                  />
                  <label style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 10, fontSize: "var(--text-sm)" }}>
                    <input type="checkbox" checked={saveBrief} onChange={(e) => setSaveBrief(e.target.checked)} />
                    Save this brief to the project description
                  </label>
                </>
              ) : (
                <p className="small" style={{ color: "var(--color-text-tertiary)" }}>
                  Second Brain didn&apos;t find much about this project.
                </p>
              )}

              {sources.length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div className="small" style={{ fontWeight: 700, color: "var(--color-text-secondary)" }}>SOURCES</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                    {sources.map((s, i) =>
                      s.link ? (
                        <a key={i} className="small" href={s.link} target="_blank" rel="noreferrer" style={{ color: "var(--color-navy-500, #1b3a6b)" }}>
                          {s.title}
                        </a>
                      ) : (
                        <span key={i} className="small" style={{ color: "var(--color-text-tertiary)" }}>
                          {s.title}
                        </span>
                      ),
                    )}
                  </div>
                </div>
              )}

              {tasks.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="small" style={{ fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 8 }}>
                    SUGGESTED TASKS
                  </div>
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
                      <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{t.title}</div>
                      {t.instructions && (
                        <div className="small" style={{ color: "var(--color-text-secondary)", margin: "3px 0 6px" }}>
                          {t.instructions}
                        </div>
                      )}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 6, marginTop: 4, alignItems: "center" }}>
                        <select
                          style={{ ...input, borderColor: t.accepted && !t.assignedToId ? "var(--color-danger, #c62828)" : "var(--color-border)" }}
                          value={t.assignedToId}
                          onChange={(e) => setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, assignedToId: e.target.value } : x)))}
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
                          onChange={(e) => setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, dueDate: e.target.value } : x)))}
                        />
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
                </div>
              )}
            </div>
          )}
        </div>

        {phase === "findings" && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              loading={applying}
              disabled={applying || (!saveBrief && acceptedTaskCount === 0)}
              onClick={apply}
            >
              Apply{saveBrief ? " brief" : ""}
              {acceptedTaskCount > 0 ? ` + ${acceptedTaskCount} task${acceptedTaskCount > 1 ? "s" : ""}` : ""}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
