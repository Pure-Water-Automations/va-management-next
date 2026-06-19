"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { MentionTextarea } from "@/components/MentionTextarea";
import type { CommentVisibility } from "@prisma/client";

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
  const [visibility, setVisibility] = useState<CommentVisibility>("INTERNAL_ONLY");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!body.trim()) return;
    setLoading(true);
    const res = await postAction(`/api/hr/projects/${projectId}/comment`, { projectId, body, visibility });
    setLoading(false);
    if (!res.ok) {
      window.alert(res.error ?? "Comment failed");
      return;
    }
    setBody("");
    setVisibility("INTERNAL_ONLY");
    router.refresh();
  }

  return (
    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
      <MentionTextarea
        value={body}
        onChange={setBody}
        placeholder="Add a project note… use @ to mention a teammate"
        rows={3}
        style={{ ...input, resize: "vertical", boxSizing: "border-box", width: "100%" }}
      />
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as CommentVisibility)}
          aria-label="Comment visibility"
          style={{ ...input, padding: "4px 8px", fontSize: "var(--text-sm)" }}
        >
          <option value="INTERNAL_ONLY">Internal only</option>
          <option value="CLIENT_VISIBLE">Client visible</option>
        </select>
        <Button onClick={submit} loading={loading} disabled={loading || !body.trim()} variant="primary" size="sm">
          Post note
        </Button>
      </div>
    </div>
  );
}
