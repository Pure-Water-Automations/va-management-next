"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { IconSend } from "@/components/icons";

/** Comment box on the client video player — posts to the shared recordings comment API. */
export function ClientRecordingComment({ recordingId }: { recordingId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = body.trim();
    if (!text || busy) return;
    setBusy(true);
    const res = await postAction("/api/recordings/comment", { recordingId, body: text });
    setBusy(false);
    if (!res.ok) {
      window.alert(res.error || "Couldn't post your comment.");
      return;
    }
    setBody("");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <input
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send();
        }}
        placeholder="Leave a comment for your team…"
        style={{ flex: 1, border: "1px solid var(--color-border)", borderRadius: 999, padding: "10px 16px", font: "inherit", fontSize: "var(--text-sm)", background: "var(--color-bg-secondary)", color: "var(--color-text-primary)", outline: "none" }}
      />
      <button
        type="button"
        onClick={send}
        disabled={busy || !body.trim()}
        title="Send"
        aria-label="Send comment"
        style={{ appearance: "none", border: "none", cursor: busy ? "default" : "pointer", flex: "none", width: 40, height: 40, borderRadius: "50%", background: "var(--color-navy-900)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "var(--shadow-navy-sm)", opacity: busy || !body.trim() ? 0.5 : 1 }}
      >
        <IconSend size={16} />
      </button>
    </div>
  );
}
