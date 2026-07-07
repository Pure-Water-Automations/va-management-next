"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import type { PageTreeNode } from "@/lib/reads/pages";

/**
 * Hub left rail: the project's nested page tree. Clicking a page swaps the
 * ?page= param (server-rendered doc). "+ Sub-page" creates under the active
 * page's parent level root.
 */
export function PageTree({
  nodes,
  activePageId,
  baseHref,
  projectId,
  canEdit,
}: {
  nodes: PageTreeNode[];
  activePageId: string;
  baseHref: string; // e.g. /hr/projects/<id>
  projectId: string | null; // null = Library tree
  canEdit: boolean;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function addPage() {
    if (!title.trim() || busy) return;
    setBusy(true);
    const res = await postAction("/api/hr/pages", {
      scope: projectId ? "PROJECT" : "LIBRARY",
      projectId: projectId ?? undefined,
      // Under the active page; at the root when the tree is still empty.
      parentId: activePageId || undefined,
      title,
    });
    setBusy(false);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to create page");
      return;
    }
    setAdding(false);
    setTitle("");
    const created = res.result as { id: string };
    router.push(`${baseHref}?tab=page&page=${created.id}`);
    router.refresh();
  }

  const item = (n: PageTreeNode) => {
    const active = n.id === activePageId;
    return (
      <a
        key={n.id}
        href={`${baseHref}?tab=page&page=${n.id}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: `7px 9px 7px ${9 + n.depth * 14}px`,
          borderRadius: 10,
          background: active ? "var(--color-sky-50, #f0fafd)" : "none",
          color: active ? "var(--color-sky-700, #177a9c)" : "var(--color-text-secondary)",
          fontSize: "var(--text-sm)",
          fontWeight: active ? 600 : 500,
          textDecoration: "none",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flex: "none", opacity: 0.6 }}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
          <path d="M14 2v6h6" />
        </svg>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{n.title}</span>
        {(n.published || n.clientVisible) && (
          <span title="Shared with client" style={{ marginLeft: "auto", fontSize: 10 }}>
            👁
          </span>
        )}
      </a>
    );
  };

  return (
    <div>
      <div
        style={{
          fontSize: "var(--text-xs)",
          fontWeight: 700,
          letterSpacing: ".12em",
          textTransform: "uppercase",
          color: "var(--color-text-tertiary)",
          padding: "2px 9px 8px",
        }}
      >
        {projectId ? "Pages" : "Library"}
      </div>
      {nodes.map(item)}
      {canEdit &&
        (adding ? (
          <input
            autoFocus
            placeholder="Sub-page title…"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void addPage();
              if (e.key === "Escape") setAdding(false);
            }}
            onBlur={() => (title.trim() ? void addPage() : setAdding(false))}
            style={{
              width: "100%",
              margin: "4px 0",
              padding: "6px 9px",
              borderRadius: 10,
              border: "1px solid var(--color-sky-400, #4DC4E8)",
              fontSize: "var(--text-sm)",
            }}
          />
        ) : (
          <button
            onClick={() => setAdding(true)}
            style={{
              display: "block",
              width: "100%",
              textAlign: "left",
              padding: "7px 9px",
              border: "none",
              borderRadius: 10,
              background: "none",
              color: "var(--color-sky-600, #1d9cc7)",
              fontSize: "var(--text-sm)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {nodes.length === 0 ? "+ New page" : "+ Sub-page"}
          </button>
        ))}
    </div>
  );
}
