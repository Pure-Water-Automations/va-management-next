import { getPipeline } from "@/lib/reads/recruitment";
import { getCurrentUser } from "@/lib/auth/access";
import { canDecideHire, isRecruiter, isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { InterviewLinksSettings } from "@/components/InterviewLinksSettings";
import { PipelineClient, type PipelineCandidate } from "./PipelineClient";

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

  // Serialize for the client sort/filter component (Dates → ISO, derive tz + dup count).
  const rows: PipelineCandidate[] = p.candidates.map((c) => {
    const aj = (c.applicationJson && typeof c.applicationJson === "object" ? c.applicationJson : {}) as Record<string, unknown>;
    return {
      candidateId: c.candidateId,
      name: c.name,
      email: c.email,
      skillsRoleTags: c.skillsRoleTags,
      applicationJson: c.applicationJson,
      source: c.source,
      screenVerdict: c.screenVerdict,
      screenScore: c.screenScore,
      screenSummary: c.screenSummary,
      screenFlags: c.screenFlags,
      screenedAtIso: c.screenedAt ? c.screenedAt.toISOString() : null,
      createdAtIso: c.createdAt.toISOString(),
      currentStage: c.currentStage,
      timezone: typeof aj.timezone === "string" ? aj.timezone : null,
      dupCount: applicationsByEmail.get(c.email.trim().toLowerCase()) ?? 1,
    };
  });

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
        {rows.length === 0 ? (
          <div style={{ padding: 24, fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No active candidates.</div>
        ) : (
          <PipelineClient
            candidates={rows}
            stageLabel={STAGE_LABEL}
            hasLink={hasLink}
            canRecruit={canRecruit}
            canDecide={canDecide}
            canGate={canGate}
          />
        )}
      </Card>
    </>
  );
}
