"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

/** Claim button (any VA) + Approve/Reject (managers) for an open-pool task. */
export function PoolTaskActions({
  taskId,
  pending,
  isManager,
}: {
  taskId: string;
  pending: { name: string } | null;
  isManager: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function call(path: string, body: Record<string, unknown>) {
    setBusy(true);
    const res = await postAction(path, body);
    setBusy(false);
    if (!res.ok) {
      window.alert(res.error ?? "Something went wrong");
      return;
    }
    router.refresh();
  }

  if (!pending) {
    return (
      <Button size="sm" variant="primary" loading={busy} disabled={busy} onClick={() => call("/api/hr/tasks/claim", { taskId })}>
        Claim this
      </Button>
    );
  }

  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <span className="small" style={{ color: "var(--color-text-tertiary)" }}>
        Claim pending: <strong>{pending.name}</strong>
      </span>
      {isManager && (
        <>
          <Button size="sm" variant="primary" loading={busy} disabled={busy} onClick={() => call("/api/hr/tasks/resolve-claim", { taskId, approve: true })}>
            Approve
          </Button>
          <Button size="sm" variant="ghost" loading={busy} disabled={busy} onClick={() => call("/api/hr/tasks/resolve-claim", { taskId, approve: false })}>
            Reject
          </Button>
        </>
      )}
    </div>
  );
}
