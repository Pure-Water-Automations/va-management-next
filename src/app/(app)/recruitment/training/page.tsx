import { getTrainingLog } from "@/lib/reads/recruitment";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

const STAGE: Record<string, string> = {
  tenhr_invited: "Invited",
  tenhr_in_progress: "In progress",
  tenhr_pass: "Passed",
  tenhr_fail: "Failed",
};

export default async function TrainingLogPage() {
  const candidates = await getTrainingLog();
  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Recruitment</div>
          <h1>Training log</h1>
        </div>
        <span className="small">{candidates.length} in the 10-hour gate</span>
      </div>

      <Card padding={0} style={{ overflow: "hidden" }} tourEl="/recruitment/training">
        {candidates.length === 0 ? (
          <div style={{ padding: 24, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>
            No candidates in training.
          </div>
        ) : (
          candidates.map((c) => {
            const hrs = (c.trainingTotalMinutes / 60).toFixed(1);
            const pct = Math.min(100, Math.round((c.trainingTotalMinutes / 600) * 100));
            return (
              <div
                key={c.candidateId}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, padding: "14px 20px", borderBottom: "1px solid var(--color-border-subtle)" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{c.name ?? c.email}</div>
                  <div className="small">
                    {c.tenhrAssignmentTitle ?? "No assignment"} · {c.trainingSessionCount} sessions
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 140 }}>
                    <div style={{ height: 8, background: "var(--color-bg-tertiary)", borderRadius: 999, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,var(--color-sky-400),var(--color-success))" }} />
                    </div>
                    <div className="small" style={{ marginTop: 4 }}>{hrs}h / 10h</div>
                  </div>
                  <Badge variant={c.trainingReadyForReview ? "success" : "info"} dot>
                    {STAGE[c.currentStage] ?? c.currentStage}
                  </Badge>
                </div>
              </div>
            );
          })
        )}
      </Card>
    </>
  );
}
