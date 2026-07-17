// AI Summary card (doc 08 §3 Screen 2). Renders a precomputed reviewer summary
// when the AI layer has compiled one; otherwise shows a graceful placeholder.
// The summary shape is a local minimal contract (view-types) — we never import
// from src/lib/trial/ai/**.

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { ReviewerAiSummary } from "./view-types";

const CONFIDENCE_VARIANT = {
  low: "default",
  medium: "info",
  high: "success",
} as const;

export function AiSummaryCard({ summary }: { summary: ReviewerAiSummary | null }) {
  const hasContent =
    summary &&
    (summary.draftSummary ||
      (summary.competencyGroups && summary.competencyGroups.length > 0));

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", fontWeight: 700 }}>
          AI evidence summary
        </div>
        <Badge variant="info" size="sm">AI-proposed · human decides</Badge>
      </div>

      {!hasContent ? (
        <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>
          AI summary not yet compiled. Review the timeline, competency evidence, and artifacts below,
          then score each rubric dimension directly.
        </div>
      ) : (
        <>
          {summary?.draftSummary && (
            <p style={{ fontSize: "var(--text-sm)", lineHeight: 1.55, color: "var(--color-text-secondary)", marginTop: 0 }}>
              {summary.draftSummary}
            </p>
          )}
          {summary?.competencyGroups && summary.competencyGroups.length > 0 && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, marginTop: 12 }}>
              {summary.competencyGroups.map((g) => (
                <div key={g.key} style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontWeight: 600, fontSize: "var(--text-sm)" }}>{g.label}</span>
                    {g.confidence && (
                      <Badge variant={CONFIDENCE_VARIANT[g.confidence]} size="sm">{g.confidence}</Badge>
                    )}
                  </div>
                  <ul style={{ margin: 0, paddingLeft: 16, fontSize: "var(--text-xs)", color: "var(--color-text-secondary)" }}>
                    {g.evidence.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}
