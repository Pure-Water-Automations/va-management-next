"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Badge } from "@/components/ui/Badge";

type Props = {
  candidateId: string;
  verdict: string | null;
  score: number | null;
  summary: string | null;
  flags: unknown;
  screenedAt: Date | string | null;
  canScreen: boolean;
};

const VERDICT: Record<string, { variant: "success" | "warning" | "danger" | "default"; label: string }> = {
  serious: { variant: "success", label: "Serious" },
  review: { variant: "warning", label: "Needs review" },
  spam: { variant: "danger", label: "Likely junk" },
};

export function ScreeningPanel({ candidateId, verdict, score, summary, flags, screenedAt, canScreen }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const flagList = Array.isArray(flags) ? (flags as unknown[]).map(String) : [];
  const v = verdict ? VERDICT[verdict] ?? { variant: "default" as const, label: verdict } : null;

  async function screen() {
    setBusy(true);
    const res = await postAction("/api/recruitment/screen", { candidateId });
    setBusy(false);
    if (!res.ok) { window.alert(res.error ?? "Screening failed"); return; }
    router.refresh();
  }

  if (!screenedAt) {
    return canScreen ? (
      <button onClick={screen} disabled={busy} style={ghostBtn}>
        {busy ? "Screening…" : "✨ AI screen this application"}
      </button>
    ) : null;
  }

  return (
    <div style={panel}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        {v && <Badge variant={v.variant} dot>{v.label}</Badge>}
        {typeof score === "number" && <span style={{ fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", fontWeight: 700, color: "var(--color-navy-900)" }}>{score}/100</span>}
        <span style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", fontWeight: 700 }}>AI first-pass</span>
        {canScreen && (
          <button onClick={screen} disabled={busy} style={{ ...linkBtn, marginLeft: "auto" }}>{busy ? "…" : "Re-screen"}</button>
        )}
      </div>
      {summary && <div style={{ fontSize: "var(--text-sm)", marginTop: 6, color: "var(--color-text-secondary)" }}>{summary}</div>}
      {flagList.length > 0 && (
        <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: "var(--text-sm)", color: "var(--color-warning-dark, #8a5a00)" }}>
          {flagList.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      )}
    </div>
  );
}

const panel: React.CSSProperties = { marginTop: 8, background: "var(--color-bg-secondary)", border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-lg)", padding: "10px 12px" };
const ghostBtn: React.CSSProperties = { marginTop: 6, border: "1px dashed var(--color-border)", background: "transparent", borderRadius: 8, padding: "6px 10px", fontSize: "var(--text-sm)", color: "var(--color-sky-600)", fontWeight: 600, cursor: "pointer" };
const linkBtn: React.CSSProperties = { border: "none", background: "transparent", color: "var(--color-sky-600)", fontSize: "var(--text-sm)", fontWeight: 600, cursor: "pointer" };
