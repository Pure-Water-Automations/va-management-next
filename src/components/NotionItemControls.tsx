"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

/**
 * Per-item Notion control for a project or task (beta). Shows the linked-page link
 * + last-synced status when linked; a "Push to Notion" button when the client has
 * a connection but the item isn't linked yet.
 */
export function NotionItemControls({
  kind,
  id,
  notionUrl,
  notionStatus,
  connected,
}: {
  kind: "project" | "task";
  id: string;
  notionUrl: string | null;
  notionStatus: string | null;
  connected: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (notionUrl) {
    return (
      <a
        href={notionUrl}
        target="_blank"
        rel="noreferrer"
        title={notionStatus ? `Notion status: ${notionStatus}` : "Open in Notion"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          fontSize: 12,
          fontWeight: 600,
          color: "var(--color-navy-900, #1a2b4a)",
          border: "1px solid var(--color-border, var(--border))",
          borderRadius: 8,
          padding: "6px 10px",
          textDecoration: "none",
        }}
      >
        🔗 Notion{notionStatus ? ` · ${notionStatus}` : ""}
      </a>
    );
  }

  if (!connected) return null;

  async function push() {
    setError(null);
    setLoading(true);
    const res = await postAction(`/api/notion/link-${kind}`, { [`${kind}Id`]: id });
    setLoading(false);
    if (!res.ok) {
      setError(res.error ?? "Failed");
      return;
    }
    router.refresh();
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Button variant="ghost" size="sm" onClick={push} loading={loading} disabled={loading}>
        Push to Notion
      </Button>
      {error && <span style={{ fontSize: 11, color: "var(--color-danger, #c0392b)" }}>{error}</span>}
    </span>
  );
}
