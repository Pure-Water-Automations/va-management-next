"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";

/** A single delegation-authority checkbox that persists to the role row. */
export function RoleDelegationToggle({
  roleId,
  field,
  checked,
  label,
}: {
  roleId: string;
  field: "canDelegateTasks" | "canDelegateProjects" | "canReviewMeetingActions";
  checked: boolean;
  label: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(checked);
  const [saving, setSaving] = useState(false);

  async function toggle(next: boolean) {
    setValue(next);
    setSaving(true);
    const res = await postAction("/api/hr/roles/delegation", { roleId, [field]: next });
    setSaving(false);
    if (!res.ok) {
      setValue(!next);
      window.alert(res.error ?? "Could not update delegation authority");
      return;
    }
    router.refresh();
  }

  return (
    <label
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        cursor: saving ? "wait" : "pointer",
        opacity: saving ? 0.6 : 1,
        fontSize: "var(--text-sm)",
      }}
    >
      <input
        type="checkbox"
        checked={value}
        disabled={saving}
        onChange={(e) => toggle(e.target.checked)}
      />
      {label}
    </label>
  );
}
