"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Button, type ButtonProps } from "@/components/ui/Button";

export async function postAction(
  path: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string; result?: unknown }> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: "Bad response" }));
}

/** A button that POSTs to an action route, then refreshes server data on success. */
export function ActionButton({
  path,
  body = {},
  confirm,
  children,
  variant,
  size,
  onDone,
}: {
  path: string;
  body?: Record<string, unknown>;
  confirm?: string;
  children: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  onDone?: () => void;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;
    setLoading(true);
    const res = await postAction(path, body);
    setLoading(false);
    if (!res.ok) {
      window.alert(res.error ?? "Action failed");
      return;
    }
    onDone?.();
    router.refresh();
  }

  return (
    <Button variant={variant} size={size ?? "sm"} loading={loading} disabled={loading} onClick={run}>
      {children}
    </Button>
  );
}
