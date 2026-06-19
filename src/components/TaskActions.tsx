"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { MentionTextarea } from "@/components/MentionTextarea";
import { humanizeStatus } from "@/components/ui/task-format";

const STATUSES = ["NotStarted", "InProgress", "Done", "Blocked"] as const;

const input: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "8px 10px",
  font: "inherit",
  background: "var(--color-surface)",
};

/** Inline status dropdown — POSTs to the status route, then refreshes server data. */
export function StatusDropdown({ taskId, current }: { taskId: string; current: string }) {
  const router = useRouter();
  const [status, setStatus] = useState(current);
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    const prev = status;
    setStatus(next);
    setSaving(true);
    const res = await postAction(`/api/va/tasks/${taskId}/status`, { status: next });
    setSaving(false);
    if (!res.ok) {
      setStatus(prev);
      window.alert(res.error ?? "Update failed");
      return;
    }
    router.refresh();
  }

  return (
    <select
      value={status}
      disabled={saving}
      onChange={(e) => change(e.target.value)}
      style={{ ...input, padding: "6px 8px" }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {humanizeStatus(s)}
        </option>
      ))}
    </select>
  );
}

/** Inline comment form — POSTs to the comment route, then refreshes server data. */
export function CommentForm({ taskId }: { taskId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!body.trim()) return;
    setLoading(true);
    const res = await postAction(`/api/va/tasks/${taskId}/comment`, { body });
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
      <MentionTextarea
        value={body}
        onChange={setBody}
        placeholder="Add a comment… use @ to mention a teammate"
        rows={3}
        style={{ ...input, resize: "vertical", boxSizing: "border-box", width: "100%" }}
      />
      <div>
        <Button onClick={submit} loading={loading} disabled={loading || !body.trim()} variant="primary" size="sm">
          Post
        </Button>
      </div>
    </div>
  );
}
