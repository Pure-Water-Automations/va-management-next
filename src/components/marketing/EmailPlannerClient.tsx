"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Chip, useToast } from "@/components/sales/ui";
import type { SequenceRow } from "@/lib/reads/marketing";
import { callMarketing, ghostBtn } from "@/components/marketing/common";

export function EmailPlannerClient({ sequences, userEmail }: { sequences: SequenceRow[]; userEmail: string }) {
  const router = useRouter();
  const [toastNode, showToast] = useToast();
  const [rows, setRows] = useState<SequenceRow[]>(sequences);

  useEffect(() => setRows(sequences), [sequences]);

  async function toggle(seq: SequenceRow) {
    const nextStatus = seq.status === "active" ? "paused" : "active";
    setRows((cur) => cur.map((s) => (s.id === seq.id ? { ...s, status: nextStatus } : s)));
    const res = await callMarketing({ op: "sequence_toggle", id: seq.id });
    if (!res.ok) { showToast(res.error || "Could not update the sequence."); router.refresh(); return; }
    showToast(nextStatus === "paused" ? "Sequence paused." : "Sequence resumed.");
    router.refresh();
  }

  function audienceToast(seq: SequenceRow) {
    if (seq.audienceKind === "subscribers") {
      showToast("The full subscriber list lives in the email tool.");
    } else if (seq.audienceMembers.length === 0) {
      showToast("No one in this audience right now.");
    } else {
      showToast(`In this audience: ${seq.audienceMembers.join(" · ")}`);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {rows.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--color-text-tertiary, #98989d)" }}>No sequences yet.</div>
      )}
      {rows.map((seq) => (
        <div key={seq.id} style={{ background: "var(--color-surface, #fff)", border: "1px solid var(--color-border-subtle, #e8e8ed)", borderRadius: 16, padding: 20 }}>
          {/* Title row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 6 }}>
            <span style={{ fontSize: 17, fontWeight: 600, fontFamily: "var(--font-display)", color: "var(--color-navy-900, #132272)" }}>{seq.name}</span>
            {seq.status === "active"
              ? <Chip bg="#d4f5e2" fg="#1a7a4a">Active</Chip>
              : <Chip bg="#e8e8ed" fg="#48484a">Paused</Chip>}
            <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {seq.next ? (
                <span style={{ fontSize: 12, fontWeight: 600, color: "var(--color-sky-700, #14708f)" }}>{seq.next}</span>
              ) : null}
              <button type="button" style={ghostBtn} onClick={() => showToast(`Test email sent to ${userEmail}.`)}>Send me a test</button>
              <button type="button" style={ghostBtn} onClick={() => toggle(seq)}>{seq.status === "active" ? "Pause" : "Resume"}</button>
            </span>
          </div>

          <div style={{ fontSize: 12.5, color: "var(--color-text-secondary, #6e6e73)", marginBottom: 10 }}>{seq.descr}</div>

          {/* Audience pill (computed live) */}
          <button
            type="button"
            onClick={() => audienceToast(seq)}
            title="Who is in this audience?"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 7,
              background: "var(--color-sky-50, #e7f8fd)",
              border: "none",
              borderRadius: 9999,
              padding: "6px 13px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-sky-800, #0d5e7e)",
              cursor: "pointer",
              marginBottom: 14,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "var(--color-sky-100, #d3f1fa)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "var(--color-sky-50, #e7f8fd)"; }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            {seq.audienceLabel}
          </button>

          {/* Steps */}
          <div style={{ borderTop: "1px solid var(--color-border-subtle, #e8e8ed)" }}>
            {seq.steps.map((step, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: i < seq.steps.length - 1 ? "1px solid var(--color-border-subtle, #e8e8ed)" : "none" }}>
                <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 11, fontWeight: 600, color: "var(--color-navy-800, #1a278a)", background: "var(--color-navy-50, #eef0fa)", borderRadius: 6, padding: "3px 8px", whiteSpace: "nowrap" }}>
                  {step.day}
                </span>
                <span style={{ flex: 1, fontSize: 13.5, fontWeight: 500, color: "var(--color-text-primary, #1d1d1f)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {step.subject}
                </span>
                <span style={{ fontSize: 12, color: "var(--color-text-tertiary, #98989d)", whiteSpace: "nowrap" }}>{step.state}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
      {toastNode}
    </div>
  );
}
