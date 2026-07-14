"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";

const helpText =
  "Unflagged rows for this VA can be approved in one click. Anomaly-flagged rows always need individual review.";

const boxStyle: React.CSSProperties = {
  width: 16,
  height: 16,
  marginTop: 2,
  accentColor: "var(--color-navy-600)",
};

/** HR-only registry control for payroll bulk-approve trust. */
export function TrustedBulkApproveCheckbox({
  vaId,
  name,
  email,
  trustedForBulkApprove,
}: {
  vaId: string;
  name: string;
  email: string;
  trustedForBulkApprove: boolean;
}) {
  const router = useRouter();
  const [checked, setChecked] = useState(trustedForBulkApprove);
  const [saving, setSaving] = useState(false);

  async function change(next: boolean) {
    const prev = checked;
    setChecked(next);
    setSaving(true);
    const res = await postAction("/api/hr/save-va", {
      vaId,
      name,
      email,
      trustedForBulkApprove: next,
    });
    setSaving(false);
    if (!res.ok) {
      setChecked(prev);
      window.alert(res.error ?? "Couldn't update trusted payroll approval");
      return;
    }
    router.refresh();
  }

  return (
    <label
      style={{ display: "flex", alignItems: "flex-start", gap: 8, maxWidth: 290 }}
      title={helpText}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={saving}
        onChange={(e) => void change(e.target.checked)}
        style={boxStyle}
      />
      <span style={{ display: "flex", flexDirection: "column", gap: 2, whiteSpace: "normal" }}>
        <span style={{ fontWeight: 600 }}>Trusted for payroll bulk-approve</span>
        <span className="small" style={{ color: "var(--color-text-tertiary)", lineHeight: 1.35 }}>
          {helpText}
        </span>
      </span>
    </label>
  );
}
