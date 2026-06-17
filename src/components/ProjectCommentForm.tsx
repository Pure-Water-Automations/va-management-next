"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

const input: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "8px 10px",
  font: "inherit",
  background: "var(--color-surface)",
};

/** Inline project-note form — POSTs to the project comment route, then refreshes server data. */
export function ProjectCommentForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!body.trim()) return;
    setLoading(true);
    const res = await postAction(`/api/hr/projects/${projectId}/comment`, { projectId, body });
    setLoading(false);
    if (!res.ok) {
      window.alert(res.error ?? "Comment failed");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Add a project note…"
        rows={3}
        style={{ ...input, resize: "vertical", boxSizing: "border-box", width: "100%" }}
      />
      <div>
        <Button onClick={submit} loading={loading} disabled={loading || !body.trim()} variant="primary" size="sm">
          Post note
        </Button>
      </div>
    </div>
  );
}
