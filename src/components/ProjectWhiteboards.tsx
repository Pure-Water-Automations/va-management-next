"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

type BoardItem = { id: string; title: string; updatedAt: Date | string; createdBy: { name: string | null } };

const boardIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 4h16a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V5a1 1 0 011-1z M8 20l4-4 4 4 M8.5 8.5h3 M8.5 11.5h6" />
  </svg>
);

/**
 * Whiteboards panel on the project detail page. Lists the project's boards and
 * creates a new one (then navigates straight into the full-bleed editor). The board
 * itself lives at /hr/projects/[id]/board/[boardId]; its "Convert to tasks" flow
 * promotes notes into real project tasks.
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
  const [creating, setCreating] = useState(false);

  async function create() {
    setCreating(true);
    const res = await postAction(`/api/hr/projects/${projectId}/whiteboards`, {});
    setCreating(false);
    if (!res.ok) {
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
          <Button variant="secondary" size="sm" onClick={create} loading={creating} disabled={creating}>
            + New whiteboard
          </Button>
        )}
      </div>

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
