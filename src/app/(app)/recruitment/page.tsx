import { redirect } from "next/navigation";
import { getPipeline } from "@/lib/reads/recruitment";
import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { pluralize } from "@/lib/labels";
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
  const user = await getCurrentUser();
  // Guard using isAllAccess + isRecruiter, matching the /sales guard (Phase 0 guard
  // sweep) — /recruitment previously had no route guard at all.
  if (!isRecruiter(user.role) && !isAllAccess(user)) redirect("/");
  const [p, linkSettings] = await Promise.all([
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

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Recruitment</div>
          <h1>Candidate pipeline</h1>
        </div>
        <span className="small">{p.candidates.length} active {pluralize(p.candidates.length, "candidate")}</span>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 24 }}>
        {/* 'closed' candidates are excluded from the list + the "active" header, so
            hide that badge too — otherwise "Closed · N" points at rows that aren't shown. */}
        {p.stages.filter((s) => s !== "closed").map((s) => (
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
                  <Badge variant="info">{STAGE_LABEL[c.currentStage] ?? c.currentStage}</Badge>
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
