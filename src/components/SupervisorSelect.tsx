"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";

const sel: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: 6,
  padding: "5px 8px",
  font: "inherit",
  fontSize: "var(--text-sm)",
  background: "var(--color-surface, #fff)",
  maxWidth: 160,
};

/** Inline "reports to" picker for a VA in the registry. HR-only. */
export function SupervisorSelect({
  vaId,
  current,
  candidates,
}: {
  vaId: string;
  current: string | null;
  candidates: { vaId: string; name: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? "");
  const [saving, setSaving] = useState(false);

  async function change(next: string) {
    const prev = value;
    setValue(next);
    setSaving(true);
    const res = await postAction("/api/hr/set-supervisor", { vaId, supervisorVaId: next || undefined });
    setSaving(false);
    if (!res.ok) {
      setValue(prev);
      window.alert(res.error ?? "Couldn't update supervisor");
      return;
    }
    router.refresh();
  }

  return (
    <select value={value} disabled={saving} onChange={(e) => change(e.target.value)} style={sel} aria-label="Supervisor">
      <option value="">— none —</option>
      {candidates.map((c) => (
        <option key={c.vaId} value={c.vaId}>
          {c.name}
        </option>
      ))}
    </select>
  );
}
