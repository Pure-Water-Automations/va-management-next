"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { rubricCategories, type RubricKind } from "@/lib/services/evaluation-rubric";

export type EvalView = {
  evaluationId: string;
  vaName: string;
  rubric: RubricKind;
  stage: string | null;
  status: string;
  targetRole: string | null;
  selfScore: number | null;
  supervisorScore: number | null;
  combinedScore: number | null;
  autoRecommendation: string | null;
  supervisorRecommendation: string | null;
  selfScores: Record<string, number> | null;
  supervisorScores: Record<string, number> | null;
  selfComment: string | null;
  supervisorComment: string | null;
  portfolioUrl: string | null;
};

const AUTO_VARIANT: Record<string, "success" | "warning" | "default"> = {
  promote: "success",
  hold: "warning",
  extend_training: "warning",
  pending: "default",
};

export function EvaluationReviewCard({ ev, canDecide }: { ev: EvalView; canDecide: boolean }) {
  const router = useRouter();
  const cats = rubricCategories(ev.rubric);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState("");
  const ready = ev.status === "ready_for_review";

  async function decide(kind: "approve" | "decline") {
    if (kind === "approve" && !window.confirm(`Approve ${ev.vaName} → ${ev.targetRole ?? "next role"}? This changes their pay.`)) return;
    if (kind === "decline" && !window.confirm(`Decline ${ev.vaName}'s evaluation? They stay at their current level.`)) return;
    setBusy(kind);
    const path = kind === "approve" ? "/api/hr/approve-evaluation" : "/api/hr/decline-evaluation";
    const res = await postAction(path, { evaluationId: ev.evaluationId, hrNotes: notes.trim() || undefined });
    setBusy("");
    if (!res.ok) { window.alert(res.error ?? "Failed"); return; }
    router.refresh();
  }

  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "var(--text-lg)" }}>{ev.vaName}</div>
          <div className="small">
            {ev.rubric === "TRAINEE" ? "Trainee" : "Tier"} evaluation{ev.targetRole ? ` → ${ev.targetRole}` : ""}
            {ev.stage ? ` · ${ev.stage}` : ""}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Badge variant={ready ? "success" : "default"} dot>{ev.status.replace(/_/g, " ")}</Badge>
          {ev.autoRecommendation && ev.autoRecommendation !== "pending" && (
            <Badge variant={AUTO_VARIANT[ev.autoRecommendation] ?? "default"}>
              auto: {ev.autoRecommendation.replace(/_/g, " ")}
            </Badge>
          )}
        </div>
      </div>

      <div style={scoreRow}>
        <Score label="Self" value={ev.selfScore} />
        <Score label="Supervisor" value={ev.supervisorScore} />
        <Score label="Combined" value={ev.combinedScore} strong />
        {ev.supervisorRecommendation && (
          <div style={{ alignSelf: "center" }} className="small">
            Supervisor says: <strong>{ev.supervisorRecommendation.replace(/_/g, " ")}</strong>
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginTop: 14 }}>
        <Breakdown title="Self-assessment" cats={cats} scores={ev.selfScores} comment={ev.selfComment} extra={ev.portfolioUrl ? `Portfolio: ${ev.portfolioUrl}` : null} />
        <Breakdown title="Supervisor" cats={cats} scores={ev.supervisorScores} comment={ev.supervisorComment} />
      </div>

      {canDecide && ready && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--color-border-subtle)", paddingTop: 14 }}>
          <textarea
            placeholder="HR notes (optional — saved with the decision)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: "100%", minHeight: 56, border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "9px 11px", font: "inherit", fontSize: "var(--text-sm)", marginBottom: 10 }}
          />
          <div style={{ display: "flex", gap: 8 }}>
            <Button size="sm" variant="primary" loading={busy === "approve"} onClick={() => decide("approve")}>Approve & promote</Button>
            <Button size="sm" variant="ghost" loading={busy === "decline"} onClick={() => decide("decline")}>Decline</Button>
          </div>
        </div>
      )}
      {canDecide && !ready && (
        <div className="small" style={{ marginTop: 12, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>
          Waiting on {ev.selfScore == null ? "the VA’s self-assessment" : ""}{ev.selfScore == null && ev.supervisorScore == null ? " and " : ""}{ev.supervisorScore == null ? "the supervisor assessment" : ""} before you can decide.
        </div>
      )}
    </div>
  );
}

function Score({ label, value, strong }: { label: string; value: number | null; strong?: boolean }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div className="small" style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "var(--text-xs)" }}>{label}</div>
      <div style={{ fontFamily: "var(--font-display)", fontSize: strong ? "var(--text-2xl)" : "var(--text-xl)", color: strong ? "var(--color-navy, #132272)" : "var(--color-text-primary)" }}>
        {value == null ? "—" : value.toFixed(2)}
      </div>
    </div>
  );
}

function Breakdown({ title, cats, scores, comment, extra }: { title: string; cats: readonly { key: string; label: string }[]; scores: Record<string, number> | null; comment: string | null; extra?: string | null }) {
  return (
    <div style={{ background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", padding: 12 }}>
      <div className="small" style={{ fontWeight: 700, marginBottom: 8 }}>{title}</div>
      {!scores ? (
        <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>Not submitted yet.</div>
      ) : (
        cats.map((c) => (
          <div key={c.key} style={{ display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", padding: "2px 0" }}>
            <span>{c.label}</span>
            <strong>{scores[c.key] ?? "—"}</strong>
          </div>
        ))
      )}
      {comment && <div className="small" style={{ marginTop: 8, color: "var(--color-text-secondary)" }}>“{comment}”</div>}
      {extra && <div className="small" style={{ marginTop: 6 }}>{extra}</div>}
    </div>
  );
}

const card: React.CSSProperties = { border: "1px solid var(--color-border)", borderRadius: "var(--radius-lg)", padding: 18, marginBottom: 16, background: "var(--color-surface)" };
const scoreRow: React.CSSProperties = { display: "flex", gap: 24, marginTop: 14, alignItems: "center", flexWrap: "wrap" };
