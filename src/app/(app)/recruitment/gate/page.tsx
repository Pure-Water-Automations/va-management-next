import { getGateQueue } from "@/lib/reads/hr-extra";
import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ActionButton";
import { ApplicationDetails } from "@/components/ApplicationDetails";
import { ScreeningPanel } from "@/components/ScreeningPanel";

export const dynamic = "force-dynamic";

const REC_LABEL: Record<string, string> = {
  recommend_hire: "Recommend hire",
  consider: "Consider",
  on_waitlist: "Waitlist",
  pass: "Pass",
};

export default async function GateReviewPage() {
  const [user, candidates] = await Promise.all([getCurrentUser(), getGateQueue()]);
  const canReview = isGateReviewer(user.role) || user.isAdmin;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Recruitment</div>
          <h1>10-hour gate review</h1>
        </div>
        <span className="small">{candidates.length} in review</span>
      </div>

      {candidates.length === 0 ? (
        <Card><div style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No candidates awaiting gate review.</div></Card>
      ) : (
        candidates.map((c) => {
          const hrs = (c.trainingTotalMinutes / 60).toFixed(1);
          const scores = [
            ["Communication", c.commScore],
            ["Reliability", c.reliabilityScore],
            ["Ownership", c.ownershipScore],
            ["Skill fit", c.skillFitScore],
          ] as const;
          const hasInterview = c.interviewDate != null && scores.some(([, v]) => v != null);
          const recentSessions = c.sessions.slice(0, 8);

          return (
            <Card key={c.candidateId} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{c.name ?? c.email}</div>
                  <div className="small">
                    {c.email} · {hrs}h logged · {c.sessions.length} sessions · {c.tenhrAssignmentTitle ?? "no assignment"}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <Badge variant={c.trainingReadyForReview ? "success" : "info"}>{c.trainingReadyForReview ? "Ready" : "In progress"}</Badge>
                  {canReview && (
                    <>
                      <ActionButton path="/api/recruitment/gate-review" body={{ candidateId: c.candidateId, gateResult: "pass" }} confirm={`Pass ${c.name ?? c.email}? This moves them toward a contract.`} variant="secondary">Pass</ActionButton>
                      <ActionButton path="/api/recruitment/gate-review" body={{ candidateId: c.candidateId, gateResult: "fail" }} confirm={`Fail ${c.name ?? c.email}?`} variant="ghost">Fail</ActionButton>
                    </>
                  )}
                </div>
              </div>

              {/* Full picture: AI screen + interview + application + sessions */}
              <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
                {/* Interview scores */}
                <div style={box}>
                  <div style={boxTitle}>Interview</div>
                  {hasInterview ? (
                    <>
                      {scores.map(([label, v]) => (
                        <div key={label} style={scoreRow}><span>{label}</span><strong>{v != null ? `${v}/5` : "—"}</strong></div>
                      ))}
                      {c.recruiterRecommendation && (
                        <div style={{ marginTop: 6 }}><Badge variant={c.recruiterRecommendation === "recommend_hire" ? "success" : c.recruiterRecommendation === "pass" ? "default" : "warning"}>{REC_LABEL[c.recruiterRecommendation] ?? c.recruiterRecommendation}</Badge></div>
                      )}
                      {c.interviewNotes && <div className="small" style={{ marginTop: 8, color: "var(--color-text-secondary)" }}>“{c.interviewNotes}”</div>}
                    </>
                  ) : (
                    <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No interview recorded.</div>
                  )}
                </div>

                {/* AI screen */}
                <div style={box}>
                  <div style={boxTitle}>AI first-pass</div>
                  {c.screenedAt ? (
                    <ScreeningPanel candidateId={c.candidateId} verdict={c.screenVerdict} score={c.screenScore} summary={c.screenSummary} flags={c.screenFlags} screenedAt={c.screenedAt} canScreen={canReview} />
                  ) : (
                    <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>{c.source === "native_form" ? "Not screened." : "No application form on file."}</div>
                  )}
                </div>

                {/* Skills-trial checklist */}
                <div style={box}>
                  <div style={boxTitle}>Training module</div>
                  {c.taskProgress.length === 0 ? (
                    <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>Not started yet.</div>
                  ) : (
                    [...c.taskProgress]
                      .sort((a, b) => (a.assignment.sortOrder ?? 0) - (b.assignment.sortOrder ?? 0))
                      .map((p) => (
                        <div key={p.id} style={{ padding: "4px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: "var(--text-sm)" }}>
                            <span>{p.status === "done" ? "✓ " : p.status === "in_progress" ? "◴ " : "○ "}{p.assignment.task}</span>
                            <span className="small" style={{ whiteSpace: "nowrap" }}>{p.minutesSpent ? `${p.minutesSpent}m` : ""}</span>
                          </div>
                          {p.outputLink && <a href={p.outputLink} target="_blank" rel="noreferrer" style={{ fontSize: "var(--text-xs)", color: "var(--color-sky-600)", wordBreak: "break-all" }}>{p.outputLink}</a>}
                          {p.note && <div className="small" style={{ color: "var(--color-text-tertiary)" }}>“{p.note}”</div>}
                        </div>
                      ))
                  )}
                </div>
              </div>

              <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 20 }}>
                {c.source === "native_form" && <ApplicationDetails answers={c.applicationJson} />}
                {recentSessions.length > 0 && (
                  <details>
                    <summary style={{ cursor: "pointer", fontSize: "var(--text-sm)", color: "var(--color-sky-600)", fontWeight: 600 }}>Training sessions ({c.sessions.length})</summary>
                    <div style={{ marginTop: 8, background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", padding: 12 }}>
                      {recentSessions.map((s) => (
                        <div key={s.sessionId} style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: "var(--text-sm)", padding: "4px 0", borderBottom: "1px solid var(--color-border-subtle)" }}>
                          <span>{s.startTime ? new Date(s.startTime).toLocaleDateString() : "—"}{s.workNotes ? ` · ${s.workNotes.slice(0, 60)}` : ""}</span>
                          <span style={{ fontFamily: "var(--font-mono)", whiteSpace: "nowrap" }}>{s.durationMinutes != null ? `${s.durationMinutes}m` : "open"} {s.reviewStatus === "approved" ? "✅" : s.reviewStatus === "rejected" ? "❌" : ""}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </Card>
          );
        })
      )}
    </>
  );
}

const box: React.CSSProperties = { background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", padding: 12 };
const boxTitle: React.CSSProperties = { fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", fontWeight: 700, marginBottom: 8 };
const scoreRow: React.CSSProperties = { display: "flex", justifyContent: "space-between", fontSize: "var(--text-sm)", padding: "2px 0" };
