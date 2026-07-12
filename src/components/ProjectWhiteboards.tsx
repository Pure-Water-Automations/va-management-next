"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { WHITEBOARD_TEMPLATES } from "@/lib/whiteboards/templates";

type BoardItem = { id: string; title: string; updatedAt: Date | string; createdBy: { name: string | null } };

const boardIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z M8 20l4-4 4 4 M8.5 8.5h3 M8.5 11.5h6" />
  </svg>
);

/**
 * Whiteboards panel on the project page. Lists the project's boards and creates a
 * new one — optionally from a starter template (kickoff, retro, brainstorm, …) —
 * then navigates straight into the full-bleed editor. The board lives at
 * /hr/projects/[id]/board/[boardId]; its "Convert to tasks" flow promotes notes
 * into real project tasks.
 */
export function ProjectWhiteboards({
  projectId,
  boards,
  canCreate,
}: {
  projectId: string;
  boards: BoardItem[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  async function create(templateId: string) {
    setBusy(templateId);
    const res = await postAction(`/api/hr/projects/${projectId}/whiteboards`, { template: templateId });
    if (!res.ok) {
      setBusy(null);
      window.alert(res.error ?? "Failed to create whiteboard");
      return;
    }
    const id = (res.result as { id: string }).id;
    router.push(`/hr/projects/${projectId}/board/${id}`);
  }

  return (
    <Card padding={0} style={{ overflow: "hidden", marginBottom: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "16px 20px",
          borderBottom: "1px solid var(--color-border)",
          background: "var(--color-bg-secondary)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "var(--color-sky-500)", display: "inline-flex" }}>{boardIcon}</span>
          <h2 style={{ margin: 0, fontSize: "var(--text-xl)" }}>Whiteboards</h2>
        </div>
        {canCreate && (
          <Button variant="secondary" size="sm" onClick={() => setPicking((v) => !v)}>
            {picking ? "Close" : "+ New whiteboard"}
          </Button>
        )}
      </div>

      {/* Template picker */}
      {picking && canCreate && (
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-surface)" }}>
          <div
            className="small"
            style={{ fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 12 }}
          >
            Start from a template
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
            {WHITEBOARD_TEMPLATES.map((t) => (
              <button
                key={t.id}
                onClick={() => create(t.id)}
                disabled={busy !== null}
                style={{
                  textAlign: "left",
                  display: "flex",
                  gap: 11,
                  alignItems: "flex-start",
                  padding: "13px 14px",
                  borderRadius: 14,
                  border: "1.5px solid var(--color-border)",
                  background: busy === t.id ? "var(--color-sky-50)" : "var(--color-surface)",
                  cursor: busy !== null ? "default" : "pointer",
                  opacity: busy !== null && busy !== t.id ? 0.55 : 1,
                  font: "inherit",
                  transition: "border-color .15s ease, background .15s ease",
                }}
                className="wb-tpl-card"
              >
                <span style={{ fontSize: 24, lineHeight: 1, flex: "none" }}>{t.emoji}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--color-navy-900)" }}>
                    {busy === t.id ? "Creating…" : t.name}
                  </span>
                  <span className="small" style={{ color: "var(--color-text-secondary)", lineHeight: 1.4 }}>
                    {t.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {boards.length === 0 ? (
        <div style={{ padding: "22px 20px", color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)" }}>
          No whiteboards yet. Spin one up to sketch the plan on an infinite canvas — then turn the notes
          into project tasks with <b style={{ color: "var(--color-text-secondary)" }}>Convert to tasks</b>.
        </div>
      ) : (
        <div style={{ padding: 8 }}>
          {boards.map((b) => (
            <a
              key={b.id}
              href={`/hr/projects/${projectId}/board/${b.id}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                padding: "10px 12px",
                borderRadius: 10,
                textDecoration: "none",
                color: "var(--color-navy-900)",
              }}
              className="wb-list-row"
            >
              <span style={{ color: "var(--color-sky-500)", display: "inline-flex", flex: "none" }}>{boardIcon}</span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{b.title}</div>
                <div className="small" style={{ color: "var(--color-text-tertiary)" }}>
                  Updated {new Date(b.updatedAt).toLocaleDateString()} · {b.createdBy.name ?? "—"}
                </div>
              </div>
              <span style={{ color: "var(--color-text-tertiary)", fontSize: 18 }}>›</span>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}
