"use client";

import { useState } from "react";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

export function TestEmailButton() {
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function run() {
    setLoading(true);
    setMsg(null);
    const res = await postAction("/api/admin/send-test-email", {});
    setLoading(false);
    if (res.ok) {
      const r = res.result as { sent?: string };
      setMsg({ ok: true, text: `Sent ✅ — check ${r?.sent ?? "your inbox"}` });
    } else {
      setMsg({ ok: false, text: res.error ?? "Failed to send" });
    }
  }

  return (
    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12 }}>
      <Button onClick={run} loading={loading} disabled={loading} variant="secondary">Send test email</Button>
      {msg && (
        <span style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: msg.ok ? "var(--color-success-dark)" : "var(--color-error-dark)" }}>
          {msg.text}
        </span>
      )}
    </div>
  );
}
