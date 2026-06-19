"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

type Phase = "input" | "scanning" | "results" | "error";
type TaskRow = { title: string; priority: string };
type ProjectCard = {
  id: string;
  name: string;
  description: string;
  client: string;
  rationale?: string;
  sourceQuote?: string;
  tasks: TaskRow[];
  accepted: boolean;
};

const input: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "6px 9px",
  font: "inherit",
  background: "var(--color-surface)",
  width: "100%",
  boxSizing: "border-box",
};

export function DiscoverModal({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("input");
  const [prompt, setPrompt] = useState("");
  const [steps, setSteps] = useState<string[]>([]);
  const [projects, setProjects] = useState<ProjectCard[]>([]);
  const [error, setError] = useState("");
  const [applying, setApplying] = useState(false);

  async function scan(promptText: string) {
    setPhase("scanning");
    setSteps([]);
    setError("");
    try {
      const res = await fetch(`/api/hr/projects/discover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: promptText || undefined }),
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
          } else if (ev === "proposals") {
            const list = (data.projects as Record<string, unknown>[]) ?? [];
            setProjects(
              list.map((p, i) => ({
                id: `p${i}`,
                name: String(p.name ?? ""),
                description: typeof p.description === "string" ? p.description : "",
                client: typeof p.client === "string" ? p.client : "",
                rationale: typeof p.rationale === "string" ? p.rationale : undefined,
                sourceQuote: typeof p.sourceQuote === "string" ? p.sourceQuote : undefined,
                tasks: (Array.isArray(p.tasks) ? (p.tasks as Record<string, unknown>[]) : []).map((t) => ({
                  title: String(t.title ?? ""),
                  priority: typeof t.priority === "string" ? t.priority : "Medium",
                })),
                accepted: true,
              })),
            );
            setPhase("results");
          } else if (ev === "error") {
            setError(String(data.message ?? "Scan failed."));
            setPhase("error");
          }
        }
      }
    } catch {
      setError("Second Brain request failed.");
      setPhase("error");
    }
  }

  function patch(id: string, fn: (p: ProjectCard) => ProjectCard) {
    setProjects((ps) => ps.map((p) => (p.id === id ? fn(p) : p)));
  }

  const acceptedCount = projects.filter((p) => p.accepted && p.name.trim()).length;

  async function create() {
    setApplying(true);
    const res = await postAction(`/api/hr/projects/discover/apply`, {
      projects: projects
        .filter((p) => p.accepted && p.name.trim())
        .map((p) => ({
          name: p.name.trim(),
          description: p.description.trim() || undefined,
          client: p.client.trim() || undefined,
          tasks: p.tasks.filter((t) => t.title.trim()).map((t) => ({ title: t.title.trim(), priority: t.priority })),
        })),
    });
    setApplying(false);
    if (!res.ok) {
      window.alert(res.error ?? "Create failed");
      return;
    }
    const r = res.result as { created: { name: string; tasks: number }[]; failed: { name: string; error: string }[] } | undefined;
    if (r?.failed?.length) {
      window.alert(`Created ${r.created.length} project(s). ${r.failed.length} failed:\n` + r.failed.map((f) => `- ${f.name}: ${f.error}`).join("\n"));
    }
    onClose();
    router.refresh();
  }

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(16,24,32,.5)", backdropFilter: "blur(2px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
      onClick={onClose}
    >
      <div
        style={{ background: "var(--color-surface)", borderRadius: "var(--radius-card)", width: "min(860px, 100%)", maxHeight: "90vh", display: "flex", flexDirection: "column", boxShadow: "0 24px 70px rgba(16,24,32,.32)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
          <h2 style={{ margin: 0 }}>✨ Find projects in recent comms</h2>
        </div>

        <div style={{ padding: 20, overflowY: "auto" }}>
          {phase === "input" && (
            <>
              <p className="small" style={{ color: "var(--color-text-secondary)", marginTop: 0 }}>
                I&apos;ll scan the last 7 days of meetings, WhatsApp, and email for new projects worth tracking — checking against your existing
                projects so nothing is duplicated. Anything specific to focus on? (optional)
              </p>
              <textarea
                style={{ ...input, minHeight: 70, resize: "vertical" }}
                placeholder="e.g. focus on client requests and new deliverables"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                autoFocus
              />
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <Button variant="primary" onClick={() => scan(prompt)}>
                  ✨ Scan recent comms
                </Button>
                <Button variant="ghost" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {phase === "scanning" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--color-navy-500, #1b3a6b)" }}>
                <span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid var(--color-border)", borderTopColor: "var(--color-navy-500, #1b3a6b)", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
                Scanning recent communications…
              </div>
              <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 4 }}>
                {steps.map((s, i) => (
                  <div key={i} className="small" style={{ color: "var(--color-text-secondary)" }}>
                    {i === steps.length - 1 ? "▸ " : "✓ "}
                    {s}
                  </div>
                ))}
                {steps.length === 0 && <div className="small" style={{ color: "var(--color-text-tertiary)" }}>Planning the scan…</div>}
              </div>
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          )}

          {phase === "error" && (
            <div>
              <p style={{ color: "var(--color-danger, #c62828)" }}>⚠ {error}</p>
              <div style={{ display: "flex", gap: 8 }}>
                <Button variant="primary" onClick={() => scan(prompt)}>Try again</Button>
                <Button variant="ghost" onClick={onClose}>Close</Button>
              </div>
            </div>
          )}

          {phase === "results" && (
            <div>
              {projects.length === 0 ? (
                <p className="small" style={{ color: "var(--color-text-tertiary)" }}>
                  No new projects surfaced from the last 7 days of comms — your project list looks current.
                </p>
              ) : (
                <>
                  <p className="small" style={{ color: "var(--color-text-secondary)", marginTop: 0 }}>
                    {projects.length} possible new project{projects.length > 1 ? "s" : ""} from recent comms. New tasks will be assigned to you (reassign later).
                  </p>
                  {projects.map((p) => (
                    <div
                      key={p.id}
                      style={{ border: `1px solid ${p.accepted ? "var(--color-navy-500, #1b3a6b)" : "var(--color-border)"}`, borderRadius: "var(--radius-input)", padding: 12, marginBottom: 10, opacity: p.accepted ? 1 : 0.6 }}
                    >
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <input style={{ ...input, fontWeight: 600 }} value={p.name} onChange={(e) => patch(p.id, (x) => ({ ...x, name: e.target.value }))} />
                        <Button size="sm" variant={p.accepted ? "primary" : "ghost"} onClick={() => patch(p.id, (x) => ({ ...x, accepted: !x.accepted }))}>
                          {p.accepted ? "✓ Create" : "Skipped"}
                        </Button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 6, marginTop: 6 }}>
                        <input style={input} placeholder="Description" value={p.description} onChange={(e) => patch(p.id, (x) => ({ ...x, description: e.target.value }))} />
                        <input style={input} placeholder="Client (optional)" value={p.client} onChange={(e) => patch(p.id, (x) => ({ ...x, client: e.target.value }))} />
                      </div>
                      {(p.rationale || p.sourceQuote) && (
                        <div className="small" style={{ marginTop: 6, color: "var(--color-text-tertiary)" }}>
                          {p.rationale && <div>💡 {p.rationale}</div>}
                          {p.sourceQuote && <div style={{ fontStyle: "italic" }}>“{p.sourceQuote}”</div>}
                        </div>
                      )}
                      {p.tasks.length > 0 && (
                        <div style={{ marginTop: 8 }}>
                          <div className="small" style={{ fontWeight: 700, color: "var(--color-text-secondary)", marginBottom: 4 }}>STARTER TASKS</div>
                          {p.tasks.map((t, ti) => (
                            <div key={ti} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                              <input
                                style={{ ...input, fontSize: "var(--text-sm)" }}
                                value={t.title}
                                onChange={(e) => patch(p.id, (x) => ({ ...x, tasks: x.tasks.map((y, j) => (j === ti ? { ...y, title: e.target.value } : y)) }))}
                              />
                              <button
                                onClick={() => patch(p.id, (x) => ({ ...x, tasks: x.tasks.filter((_, j) => j !== ti) }))}
                                title="Remove task"
                                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-tertiary)", fontSize: 16 }}
                              >
                                ×
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>

        {phase === "results" && projects.length > 0 && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid var(--color-border)", display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button variant="primary" loading={applying} disabled={applying || acceptedCount === 0} onClick={create}>
              Create {acceptedCount} project{acceptedCount !== 1 ? "s" : ""}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
