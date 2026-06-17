import { getCurrentUser } from "@/lib/auth/access";
import { canDecideHire } from "@/lib/auth/roles";
import { getEvaluationQueue, getStartableVas } from "@/lib/reads/evaluation";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ActionButton";
import { EvaluationReviewCard, type EvalView } from "@/components/EvaluationReviewCard";
import type { Evaluation, TierReview } from "@prisma/client";

export const dynamic = "force-dynamic";

type Json = { scores?: Record<string, number>; narratives?: { overall?: string }; portfolioUrl?: string } | null;

function toView(ev: Evaluation & { tierReview?: TierReview | null }): EvalView {
  const self = ev.selfJson as Json;
  const sup = ev.supervisorJson as Json;
  return {
    evaluationId: ev.evaluationId,
    vaName: ev.vaName ?? ev.vaId,
    rubric: ev.rubric,
    stage: ev.stage,
    status: ev.status,
    targetRole: ev.tierReview?.targetRole ?? null,
    selfScore: ev.selfScore,
    supervisorScore: ev.supervisorScore,
    combinedScore: ev.combinedScore,
    autoRecommendation: ev.autoRecommendation,
    supervisorRecommendation: ev.supervisorRecommendation,
    selfScores: self?.scores ?? null,
    supervisorScores: sup?.scores ?? null,
    selfComment: self?.narratives?.overall ?? null,
    supervisorComment: sup?.narratives?.overall ?? null,
    portfolioUrl: self?.portfolioUrl ?? null,
  };
}

export default async function EvaluationsPage() {
  const [user, queue, startable] = await Promise.all([
    getCurrentUser(),
    getEvaluationQueue(),
    getStartableVas(),
  ]);
  const canStart = canDecideHire(user.role) || user.isAdmin;
  const canDecide = canDecideHire(user.role) || user.isAdmin;
  const readyCount = queue.open.filter((e) => e.status === "ready_for_review").length;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">HR · Growth</div>
          <h1>Evaluations</h1>
        </div>
        <span className="small">{readyCount} ready to decide · {queue.open.length} in progress</span>
      </div>

      {canStart && (
        <Card style={{ marginBottom: 24 }} tourEl="/hr/evaluations">
          <h2 style={h2}>Start an evaluation</h2>
          <p className="small" style={{ marginTop: 0, marginBottom: 14 }}>
            Kicks off a dual self + supervisor assessment. Trainees are evaluated for graduation to Tier&nbsp;1; tiered VAs for their next tier.
          </p>
          {startable.length === 0 ? (
            <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>Everyone active already has an evaluation in flight or none to start.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {startable.map((v) => (
                <div key={v.vaId} style={startRow}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{v.name}</span>{" "}
                    <Badge variant="default">{v.compensationRole}</Badge>
                    {!v.supervisorVaId && <span className="small" style={{ marginLeft: 8, color: "var(--color-text-tertiary)" }}>· no supervisor set</span>}
                  </div>
                  <ActionButton
                    path="/api/hr/start-evaluation"
                    body={{ vaId: v.vaId }}
                    confirm={`Start an evaluation for ${v.name}? They and their supervisor will be asked to complete an assessment.`}
                    variant="secondary"
                  >
                    Start
                  </ActionButton>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <h2 style={{ ...h2, marginBottom: 12 }}>In progress</h2>
      {queue.open.length === 0 ? (
        <Card style={{ marginBottom: 24 }}><div className="small" style={{ fontStyle: "italic" }}>No evaluations in progress.</div></Card>
      ) : (
        queue.open.map((ev) => <EvaluationReviewCard key={ev.evaluationId} ev={toView(ev)} canDecide={canDecide} />)
      )}

      <Card padding={0} style={{ overflow: "hidden", marginTop: 8 }}>
        <div style={head}><h2 style={title}>Decided</h2></div>
        {queue.decided.length === 0 ? (
          <div style={{ padding: 24, color: "var(--color-text-tertiary)", fontStyle: "italic" }}>None yet.</div>
        ) : (
          queue.decided.map((ev) => (
            <div key={ev.evaluationId} style={row}>
              <div>
                <div style={{ fontWeight: 600 }}>{ev.vaName ?? ev.vaId}</div>
                <div className="small">{ev.rubric === "TRAINEE" ? "Trainee" : "Tier"} · combined {ev.combinedScore?.toFixed(2) ?? "—"}{ev.decidedBy ? ` · by ${ev.decidedBy}` : ""}</div>
              </div>
              <Badge variant={ev.status === "approved" ? "success" : "default"}>{ev.status}</Badge>
            </div>
          ))
        )}
      </Card>
    </>
  );
}

const h2: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: "0 0 8px" };
const head: React.CSSProperties = { padding: "16px 20px", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" };
const title: React.CSSProperties = { fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: 0 };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "14px 20px", borderBottom: "1px solid var(--color-border-subtle)" };
const startRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--color-border-subtle)" };
