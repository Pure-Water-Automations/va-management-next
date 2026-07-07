"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Portal comment box: posts a CLIENT_VISIBLE project comment. */
export function ClientCommentForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    const res = await fetch(`/api/client/projects/${projectId}/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    setBusy(false);
    if (!res.ok) {
      window.alert("Failed to send — try again");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", gap: 8, marginTop: "var(--space-3)" }}>
      <input
        value={body}
        placeholder="Write a comment for the team…"
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void send()}
        style={{
          flex: 1,
          height: 38,
          padding: "0 12px",
          borderRadius: 12,
          border: "1px solid var(--color-border)",
          fontSize: "var(--text-sm)",
          background: "var(--color-surface, #fff)",
        }}
      />
      <button
        onClick={() => void send()}
        disabled={busy || !body.trim()}
        style={{
          height: 38,
          padding: "0 16px",
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
        Send
      </button>
    </div>
  );
}
