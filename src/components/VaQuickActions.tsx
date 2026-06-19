"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

const label: React.CSSProperties = { fontSize: "var(--text-xs)", textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--color-text-tertiary)", fontWeight: 700, marginBottom: 6 };
const input: React.CSSProperties = { border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "9px 11px", font: "inherit", fontSize: "var(--text-sm)" };

function targetLabel(targetHoursWeekly: number | null | undefined) {
  return `${targetHoursWeekly ?? 0}h/week`;
}

export function VaQuickActions({ defaults }: { defaults: { targetHoursWeekly?: number | null; skillSpecs?: string | null } }) {
  const router = useRouter();
  const [target, setTarget] = useState(String(defaults.targetHoursWeekly ?? ""));
  const [skills, setSkills] = useState(defaults.skillSpecs ?? "");
  const [busy, setBusy] = useState("");

  async function run(key: string, path: string, body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(key);
    const res = await postAction(path, body);
    setBusy("");
    if (!res.ok) { window.alert(res.error || "Failed"); return; }
    window.alert("Done — thanks!");
    router.refresh();
  }

  return (
    <Card style={{ marginTop: 24 }}>
      <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: "0 0 16px" }}>Quick actions</h2>

      <div style={{ display: "grid", gap: 18, gridTemplateColumns: "1fr" }}>
        <div>
          <div style={label}>Target hours</div>
          <div className="small" style={{ marginBottom: 8 }}>
            Current target: <strong style={{ color: "var(--color-text-primary)" }}>{targetLabel(defaults.targetHoursWeekly)}</strong>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <input style={{ ...input, width: 110 }} type="number" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="hrs/wk" aria-label="Requested target hours per week" />
            <Button size="sm" variant="ghost" loading={busy === "hours"} onClick={() => run("hours", "/api/va/request-hours", { newTarget: Number(target), notes: "" })}>Request change</Button>
          </div>
        </div>

        <div>
          <div style={label}>How's your workload?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button size="sm" variant="ghost" loading={busy === "over"} onClick={() => run("over", "/api/va/flag-capacity", { flag: "overburdened", notes: "" }, "Flag yourself as overburdened? Your supervisor will be notified.")}>I'm overburdened</Button>
            <Button size="sm" variant="ghost" loading={busy === "under"} onClick={() => run("under", "/api/va/flag-capacity", { flag: "underutilized", notes: "" })}>I have capacity</Button>
          </div>
        </div>

        <div>
          <div style={label}>Update your skills</div>
          <textarea style={{ ...input, width: "100%", minHeight: 56 }} value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="e.g. WordPress, design, bookkeeping" />
          <div style={{ marginTop: 8 }}>
            <Button size="sm" variant="ghost" loading={busy === "skills"} onClick={() => run("skills", "/api/va/skill-notes", { skills })}>Save skills</Button>
          </div>
        </div>
      </div>
    </Card>
  );
}
