import { getPipeline } from "@/lib/reads/recruitment";
import { getCurrentUser } from "@/lib/auth/access";
import { canDecideHire, isRecruiter, isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ApplicationDetails } from "@/components/ApplicationDetails";
import { ScreeningPanel } from "@/components/ScreeningPanel";
import { RecruiterWorkflow } from "@/components/RecruiterWorkflow";
import { InterviewLinksSettings } from "@/components/InterviewLinksSettings";

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
  const [user, p, linkSettings] = await Promise.all([
    getCurrentUser(),
    getPipeline(),
    db.setting.findMany({ where: { key: { in: ["interview_booking_url", "intro_video_url"] } } }),
  ]);

  const linkMap = new Map(linkSettings.map((s) => [s.key, (s.value ?? "").trim()]));
  const bookingUrl = linkMap.get("interview_booking_url") ?? "";
  const videoUrl = linkMap.get("intro_video_url") ?? "";
  const hasLink = Boolean(bookingUrl || videoUrl);

  const canDecide = canDecideHire(user.role) || user.isAdmin;
  const canRecruit = isRecruiter(user.role) || user.isAdmin;
  const canGate = isGateReviewer(user.role) || user.isAdmin;
  const applicationsByEmail = new Map<string, number>();
  for (const candidate of p.candidates) {
    const email = candidate.email.trim().toLowerCase();
    applicationsByEmail.set(email, (applicationsByEmail.get(email) ?? 0) + 1);
  }

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

      {canDecide && <InterviewLinksSettings bookingUrl={bookingUrl} videoUrl={videoUrl} />}

      <Card padding={0} style={{ overflow: "hidden" }} tourEl="/recruitment">
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
                  alignItems: "flex-start",
                  gap: 12,
                  padding: "14px 20px",
                  borderBottom: "1px solid var(--color-border-subtle)",
                }}
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{c.name ?? c.email}</div>
                  <div className="small">
                    {c.email}
                    {c.skillsRoleTags ? ` · ${c.skillsRoleTags}` : ""}
                  </div>
                  <ApplicationDetails answers={c.applicationJson} />
                  {c.source === "native_form" && (
                    <ScreeningPanel
                      candidateId={c.candidateId}
                      verdict={c.screenVerdict}
                      score={c.screenScore}
                      summary={c.screenSummary}
                      flags={c.screenFlags}
                      screenedAt={c.screenedAt}
                      canScreen={canRecruit}
                    />
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="small">Applied {c.createdAt.toLocaleDateString()}</span>
                    {applicationBadges(c.applicationJson)}
                    {(applicationsByEmail.get(c.email.trim().toLowerCase()) ?? 0) > 1 && (
                      <Badge variant="warning" size="sm">⚠ applied {applicationsByEmail.get(c.email.trim().toLowerCase())}x</Badge>
                    )}
                    <Badge variant="info">{STAGE_LABEL[c.currentStage] ?? c.currentStage}</Badge>
                  </div>
                  <RecruiterWorkflow
                    candidateId={c.candidateId}
                    name={c.name}
                    email={c.email}
                    stage={c.currentStage}
                    hasVideoOrBookingLink={hasLink}
                    canRecruit={canRecruit}
                    canDecide={canDecide}
                    canGate={canGate}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </>
  );
}

function applicationBadges(applicationJson: unknown) {
  if (!applicationJson || typeof applicationJson !== "object") return null;
  const answers = applicationJson as Record<string, unknown>;
  const referralSource = typeof answers.referralSource === "string" ? answers.referralSource.trim() : "";
  const ffwpuAffiliated = typeof answers.ffwpuAffiliated === "string" ? answers.ffwpuAffiliated.trim().toLowerCase() : "";
  if (!referralSource && ffwpuAffiliated !== "yes") return null;

  return (
    <>
      {referralSource && (
        <span title={referralSource}>
          <Badge variant="default" size="sm">
            📌 {referralSource.length > 28 ? `${referralSource.slice(0, 28)}…` : referralSource}
          </Badge>
        </span>
      )}
      {ffwpuAffiliated === "yes" && (
        <Badge variant="primary" size="sm" style={{ background: "var(--color-navy-100)" }}>FFWPU</Badge>
      )}
    </>
  );
}
