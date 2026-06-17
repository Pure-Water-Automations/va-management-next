"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Badge } from "@/components/ui/Badge";

const STATUSES = ["Planning", "Active", "Done", "Paused"] as const;
const PRIORITIES = ["Low", "Medium", "High"] as const;

const pill: React.CSSProperties = {
  font: "inherit",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  border: "1px solid var(--color-border)",
  borderRadius: 999,
  padding: "4px 12px",
  background: "var(--color-surface)",
  cursor: "pointer",
};

/**
 * Inline-editable project status + priority shown in the project header.
 * Click either pill to change it — saves immediately (updateProject), no Edit page.
 * Read-only viewers (no canManageProjects) see plain badges instead.
 */
export function ProjectStatusControls({
  projectId,
  status,
  priority,
  canEdit,
}: {
  projectId: string;
  status: string;
  priority: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState<null | "status" | "priority">(null);

  async function save(field: "status" | "priority", value: string) {
    setSaving(field);
    const res = await postAction(`/api/hr/projects/${projectId}`, { [field]: value });
    setSaving(null);
    if (!res.ok) {
      window.alert(res.error ?? "Failed to update");
      return;
    }
    router.refresh();
  }

  if (!canEdit) {
    return (
      <>
        <Badge variant={status === "Active" ? "primary" : "default"}>{status}</Badge>
        <Badge variant={priority === "High" ? "danger" : "warning"}>{priority}</Badge>
      </>
    );
  }

  return (
    <>
      <select
        aria-label="Project status"
        title="Change status"
        style={pill}
        value={status}
        disabled={saving === "status"}
        onChange={(e) => save("status", e.target.value)}
      >
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <select
        aria-label="Project priority"
        title="Change priority"
        style={pill}
        value={priority}
        disabled={saving === "priority"}
        onChange={(e) => save("priority", e.target.value)}
      >
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {p}
          </option>
        ))}
      </select>
    </>
  );
}
