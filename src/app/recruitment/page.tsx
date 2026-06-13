import { getPipeline } from "@/lib/reads/recruitment";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

export const dynamic = "force-dynamic";

const STAGE_LABEL: Record<string, string> = {
  applied: "Applied",
  reviewed: "Reviewed",
  interview_scheduled: "Interview scheduled",
  interviewed: "Interviewed",
  decision: "Decision",
  tenhr_invited: "10-hr invited",
  tenhr_in_progress: "10-hr in progress",
  tenhr_pass: "10-hr pass",
  tenhr_fail: "10-hr fail",
  contract_sent: "Contract sent",
  signed: "Signed",
  onboarding: "Onboarding",
  closed: "Closed",
};

export default async function RecruitmentConsole() {
  const p = await getPipeline();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Recruitment</div>
          <h1>Candidate pipeline</h1>
        </div>
        <span className="small">{p.candidates.length} active candidates</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {p.stages.map((s) => (
          <Badge key={s} variant={p.counts[s] ? "primary" : "default"}>
            {STAGE_LABEL[s]} · {p.counts[s]}
          </Badge>
        ))}
      </div>

      <Card padding={0} style={{ overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--color-border)", background: "var(--color-bg-secondary)" }}>
          <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: 0 }}>Candidates</h2>
        </div>
        <div>
          {p.candidates.length === 0 ? (
            <div style={{ padding: 24, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>
              No active candidates.
            </div>
          ) : (
            p.candidates.map((c) => (
              <div
                key={c.candidateId}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>{c.name ?? c.email}</div>
                  <div className="small">
                    {c.email}
                    {c.skillsRoleTags ? ` · ${c.skillsRoleTags}` : ""}
                  </div>
                </div>
                <Badge variant="info">{STAGE_LABEL[c.currentStage] ?? c.currentStage}</Badge>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
}
