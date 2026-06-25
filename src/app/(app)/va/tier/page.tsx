import { getCurrentUser, getEffectiveVaId } from "@/lib/auth/access";
import { humanRole } from "@/lib/labels";
import { getVaDashboard } from "@/lib/reads/va";
import { db } from "@/lib/db";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Stat } from "@/components/ui/Stat";
import { SkillAttestationForm } from "@/components/SkillAttestationForm";

export const dynamic = "force-dynamic";

const DEFAULT_SKILLS = "Bookkeeping, Comms, Content, Design, Onboarding, Project Management, Research, Scheduling, Social Media, Team Management, Tech/Automation, Video Editing";

export default async function VaTierPage() {
  const user = await getCurrentUser();
  const vaId = await getEffectiveVaId(user);
  if (!vaId) {
    return (
      <div className="page-head"><div><h1>Tier progress</h1><p className="small">Your login isn’t linked to a VA record.</p></div></div>
    );
  }
  const d = await getVaDashboard(vaId);
  const threshold = d.role?.minTotalHoursToReachNext ?? null;
  const pct = threshold ? Math.min(100, Math.round((d.cumulative / threshold) * 100)) : null;

  // Skill attestation is requested only while a tier review is open and awaiting it.
  const [openReview, skillSetting] = await Promise.all([
    db.tierReview.findFirst({ where: { vaId, status: { in: ["hours_triggered", "form_sent"] } }, orderBy: { timestamp: "desc" } }),
    db.setting.findUnique({ where: { key: "skill_list" }, select: { value: true } }),
  ]);
  const skillOptions = (skillSetting?.value || DEFAULT_SKILLS).split(",").map((s) => s.trim()).filter(Boolean);
  const currentSkills = (d.va.skillSpecs || "").split(",").map((s) => s.trim()).filter((s) => skillOptions.includes(s));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">My Console</div>
          <h1>Tier progress</h1>
        </div>
        <Badge variant="primary">{humanRole(d.va.compensationRole)}</Badge>
      </div>

      <div className="stat-grid">
        <Stat label="Cumulative hours" value={Math.round(d.cumulative)} unit="h" variant="navy" />
        <Stat label="Current role" value={humanRole(d.va.compensationRole)} />
        <Stat label="Next role" value={d.role?.nextRoleId ? humanRole(d.role.nextRoleId) : "—"} />
        <Stat label="Hours to next" value={d.hoursToNext != null ? Math.round(d.hoursToNext) : "—"} unit={d.hoursToNext != null ? "h" : undefined} />
      </div>

      <Card tourEl="/va/tier">
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: "0 0 14px" }}>Advancement</h2>
        {d.role?.nextRoleId && threshold ? (
          <>
            <div style={{ height: 12, background: "var(--color-bg-tertiary)", borderRadius: 999, overflow: "hidden", marginBottom: 8 }}>
              <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,var(--color-sky-400),var(--color-success))" }} />
            </div>
            <div className="small">
              {Math.round(d.cumulative)}h of {threshold}h toward {humanRole(d.role.nextRoleId)}
              {d.eligibility.eligible && " — "}
              {d.eligibility.eligible && <Badge variant="success" dot>Eligible — pending HR review</Badge>}
            </div>
            {d.role.additionalRequirements && (
              <p className="small" style={{ marginTop: 12 }}>Also required: {d.role.additionalRequirements}</p>
            )}
          </>
        ) : (
          <div className="small">You’re at the top of the current ladder.</div>
        )}
      </Card>

      {openReview && (
        <Card style={{ marginTop: 24, borderColor: "var(--color-sky-300)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: 0 }}>Skill attestation needed</h2>
            <Badge variant="warning" dot>Action needed</Badge>
          </div>
          <SkillAttestationForm vaId={vaId} skillOptions={skillOptions} current={currentSkills} />
        </Card>
      )}
    </>
  );
}
