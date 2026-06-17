"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";

type SavedView = { id: string; name: string; query: string };

/**
 * Saved-views row for the All-Tasks list: apply a saved view (chip link),
 * delete one (× on the chip), or save the current querystring as a new view.
 */
export function SavedViewsBar({
  views,
  currentQuery,
}: {
  views: SavedView[];
  /** The active querystring WITHOUT a leading "?". */
  currentQuery: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function saveCurrent() {
    const name = window.prompt("Name this view");
    if (!name || !name.trim()) return;
    setBusy(true);
    const res = await postAction("/api/hr/views", {
      name: name.trim(),
      scope: "tasks",
      query: currentQuery,
    });
    setBusy(false);
    if (!res.ok) {
      window.alert(res.error ?? "Could not save view");
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    setBusy(true);
    const res = await postAction("/api/hr/views/delete", { id });
    setBusy(false);
    if (!res.ok) {
      window.alert(res.error ?? "Could not delete view");
      return;
    }
    router.refresh();
  }

  const chipStyle: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 4px 4px 10px",
    borderRadius: 999,
    border: "1px solid var(--color-border)",
    background: "var(--color-bg-secondary)",
    fontSize: "var(--text-sm)",
  };

  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: 8,
        marginBottom: 16,
      }}
    >
      {views.map((v) => (
        <span key={v.id} style={chipStyle}>
          <a
            href={`/hr/tasks?${v.query}`}
            style={{
              textDecoration: "none",
              color: "var(--color-text-secondary)",
              fontWeight: 600,
            }}
          >
            {v.name}
          </a>
          <button
            type="button"
            aria-label={`Delete view ${v.name}`}
            disabled={busy}
            onClick={() => remove(v.id)}
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--color-text-tertiary)",
              fontSize: 16,
              lineHeight: 1,
              padding: "0 4px",
            }}
          >
            ×
          </button>
        </span>
      ))}

      <button
        type="button"
        disabled={busy}
        onClick={saveCurrent}
        style={{
          ...chipStyle,
          padding: "4px 12px",
          cursor: "pointer",
          color: "var(--color-text-secondary)",
          fontWeight: 600,
        }}
      >
        ★ Save current view
      </button>
    </div>
  );
}
