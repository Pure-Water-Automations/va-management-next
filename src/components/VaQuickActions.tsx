"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";

const label: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--color-text-tertiary)",
  fontWeight: 700,
  marginBottom: 12,
};
const card: React.CSSProperties = {
  background: "var(--color-surface)",
  border: "1px solid var(--color-border-subtle)",
  borderRadius: "var(--radius-lg)",
  padding: 18,
};
const input: React.CSSProperties = {
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "9px 11px",
  font: "inherit",
  fontSize: "var(--text-sm)",
  background: "#fff",
  outline: "none",
};
const pillBtn: React.CSSProperties = {
  appearance: "none",
  cursor: "pointer",
  font: "inherit",
  fontSize: "var(--text-sm)",
  fontWeight: 600,
  color: "var(--color-sky-700)",
  background: "var(--color-sky-50)",
  border: "1px solid var(--color-sky-100)",
  padding: "9px 14px",
  borderRadius: 999,
};

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
    if (!res.ok) {
      window.alert(res.error || "Failed");
      return;
    }
    window.alert("Done — thanks!");
    router.refresh();
  }

  function workloadBtn(active: boolean): React.CSSProperties {
    return {
      flex: 1,
      appearance: "none",
      cursor: "pointer",
      font: "inherit",
      fontSize: "var(--text-sm)",
      fontWeight: 600,
      padding: "10px 0",
      borderRadius: "var(--radius-input)",
      border: "1.5px solid var(--color-border)",
      background: "var(--color-surface)",
      color: "var(--color-text-secondary)",
      opacity: active ? 0.6 : 1,
    };
  }

  return (
    <>
      <h3 className="sec-title" style={{ margin: "30px 0 12px" }}>Quick actions</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
        <div style={card}>
          <div style={label}>Target hours</div>
          <div className="small" style={{ marginBottom: 12 }}>
            Now: <strong style={{ color: "var(--color-navy-900)" }}>{targetLabel(defaults.targetHoursWeekly)}</strong>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input
              style={{ ...input, width: 88 }}
              type="number"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="hrs/wk"
              aria-label="Requested target hours per week"
            />
            <button style={pillBtn} disabled={busy === "hours"} onClick={() => run("hours", "/api/va/request-hours", { newTarget: Number(target), notes: "" })}>
              Request change
            </button>
          </div>
        </div>

        <div style={card}>
          <div style={label}>How&apos;s your workload?</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              style={workloadBtn(busy === "over")}
              disabled={busy === "over"}
              onClick={() => run("over", "/api/va/flag-capacity", { flag: "overburdened", notes: "" }, "Flag yourself as overburdened? Your supervisor will be notified.")}
            >
              Overburdened
            </button>
            <button
              style={workloadBtn(busy === "under")}
              disabled={busy === "under"}
              onClick={() => run("under", "/api/va/flag-capacity", { flag: "underutilized", notes: "" })}
            >
              Have capacity
            </button>
          </div>
        </div>

        <div style={card}>
          <div style={label}>Update your skills</div>
          <input
            style={{ ...input, width: "100%", marginBottom: 10 }}
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
            placeholder="e.g. Mailchimp, Canva, bookkeeping"
          />
          <button style={pillBtn} disabled={busy === "skills"} onClick={() => run("skills", "/api/va/skill-notes", { skills })}>
            Save skills
          </button>
        </div>
      </div>
    </>
  );
}
