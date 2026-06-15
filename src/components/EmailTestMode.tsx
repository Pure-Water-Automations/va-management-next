"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

export function EmailTestMode({ current, defaultTarget }: { current: string; defaultTarget: string }) {
  const router = useRouter();
  const [target, setTarget] = useState(current || defaultTarget);
  const [busy, setBusy] = useState("");
  const on = Boolean(current);

  async function set(key: string, email: string) {
    setBusy(key);
    const res = await postAction("/api/admin/email-test-mode", { email });
    setBusy("");
    if (!res.ok) { window.alert(res.error ?? "Failed"); return; }
    router.refresh();
  }

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        {on ? <Badge variant="warning" dot>TEST MODE ON</Badge> : <Badge variant="success" dot>Off — sending normally</Badge>}
        {on && <span className="small">all mail → <strong>{current}</strong></span>}
      </div>
      <p className="small" style={{ marginTop: 0, marginBottom: 14 }}>
        While ON, <strong>every</strong> system email (applicant notices, interview &amp; training invites, rate-change alerts, test emails) is redirected to one address instead of the real recipient — so testing never emails real applicants or VAs. The subject is prefixed <code>[TEST]</code> and the real recipient is noted in the body.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="redirect-to@email.com"
          disabled={on}
          style={{ border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "8px 11px", font: "inherit", fontSize: "var(--text-sm)", minWidth: 280, opacity: on ? 0.6 : 1 }}
        />
        {on ? (
          <Button variant="ghost" loading={busy === "off"} onClick={() => set("off", "")}>Turn off test mode</Button>
        ) : (
          <Button variant="primary" loading={busy === "on"} onClick={() => set("on", target.trim())}>Turn on test mode</Button>
        )}
      </div>
    </div>
  );
}
