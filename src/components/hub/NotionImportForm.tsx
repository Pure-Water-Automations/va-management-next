"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";

type Result = { pageId: string; title: string; count: number };

/** Founder-only: paste a Notion page URL, import it (and sub-pages) into the hub. */
export function NotionImportForm({
  projects,
}: {
  projects: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [projectId, setProjectId] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function run() {
    if (!url.trim() || busy) return;
    setBusy(true);
    setResult(null);
    const res = await postAction("/api/hr/notion/import", {
      notionPage: url.trim(),
      projectId: projectId || undefined,
    });
    setBusy(false);
    if (!res.ok) {
      window.alert(res.error ?? "Import failed");
      return;
    }
    setResult(res.result as Result);
    router.refresh();
  }

  const field: React.CSSProperties = {
    width: "100%",
    height: 40,
    padding: "0 12px",
    borderRadius: 12,
    border: "1px solid var(--color-border)",
    fontSize: "var(--text-sm)",
    marginBottom: 10,
    background: "var(--color-surface)",
  };

  return (
    <div style={{ maxWidth: 520 }}>
      <input
        placeholder="Notion page URL or id…"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        style={field}
      />
      <select
        aria-label="Import destination"
        value={projectId}
        onChange={(e) => setProjectId(e.target.value)}
        style={field}
      >
        <option value="">→ Library (SOPs / wiki)</option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            → Project: {p.name}
          </option>
        ))}
      </select>
      <button
        onClick={() => void run()}
        disabled={busy || !url.trim()}
        style={{
          height: 40,
          padding: "0 18px",
          borderRadius: 999,
          border: "none",
          background: "var(--color-navy-900, #132272)",
          color: "#fff",
          fontSize: "var(--text-sm)",
          fontWeight: 600,
          cursor: "pointer",
          opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? "Importing…" : "Import from Notion"}
      </button>
      {result && (
        <p style={{ fontSize: "var(--text-sm)", color: "var(--color-success-dark, #1d7a4c)" }}>
          ✓ Imported “{result.title}” ({result.count} page{result.count === 1 ? "" : "s"}). Re-running
          updates in place — it never duplicates.
        </p>
      )}
      <p style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>
        Read-only against Notion. Sub-pages import automatically (3 levels). Unsupported block
        types degrade to a note instead of disappearing.
      </p>
    </div>
  );
}
