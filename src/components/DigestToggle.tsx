"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";

/** Admin toggle for the daily task-digest email (notification_digest_enabled). */
export function DigestToggle({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle(next: boolean) {
    setBusy(true);
    const res = await postAction("/api/admin/digest-config", { enabled: next });
    setBusy(false);
    if (!res.ok) { window.alert(res.error ?? "Couldn't update the digest setting"); return; }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      {enabled
        ? <Badge variant="success" dot>On — sends each morning</Badge>
        : <Badge variant="warning" dot>Off</Badge>}
      {enabled
        ? <Button variant="ghost" loading={busy} onClick={() => toggle(false)}>Turn off</Button>
        : <Button variant="primary" loading={busy} onClick={() => toggle(true)}>Turn on</Button>}
    </div>
  );
}
