import { notFound } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/Card";
import { TRIAL_EVENTS } from "@/lib/trial/events";
import { RUBRIC_DIMENSIONS, type TrialFeedback } from "@/lib/trial/types";
import { ConsoleHeader } from "../ConsoleHeader";
import { AiSummaryCard } from "../AiSummaryCard";
import { TimelinePanel } from "../TimelinePanel";
import { CompetencyExplorer } from "../CompetencyExplorer";
import { ArtifactComparison, type MissionArtifact } from "../ArtifactComparison";
import { ReviewPanel } from "../ReviewPanel";
import { rubricEvidenceCounts } from "../competency-map";
import type { ReviewerAiSummary, RubricRowView, TimelineEntry } from "../view-types";

export const dynamic = "force-dynamic";

const DAY_MS = 24 * 60 * 60 * 1000;

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Active",
  SUBMITTED: "Evidence ready",
  REVISION: "Under revision",
  COMPLETED: "Completed",
};

export default async function TrialReviewConsole({
  params,
}: {
  params: Promise<{ candidateId: string }>;
}) {
  if (!env.SKILLS_TRIAL_V2) notFound();

  const user = await getCurrentUser();
  const canReview = isGateReviewer(user.role) || user.isAdmin;

  const { candidateId } = await params;

  const trial = await db.candidateTrial.findUnique({
    where: { candidateId },
    include: {
      candidate: { select: { name: true, email: true } },
      missions: { include: { template: true } },
      events: { orderBy: { timestamp: "asc" } },
      conversations: {
        where: { actorType: "Human" },
        include: { messages: { orderBy: { timestamp: "asc" } } },
      },
    },
  });
  if (!trial) notFound();

  const now = new Date();
  const day = Math.max(1, Math.floor((now.getTime() - trial.startDate.getTime()) / DAY_MS) + 1);

  const candidateName = trial.candidate.name ?? trial.candidate.email;
  const missions = [...trial.missions].sort(
    (a, b) => (a.template.sortOrder ?? 0) - (b.template.sortOrder ?? 0),
  );
  const totalSteps = missions.length || 9;
  const approvedCount = missions.filter((m) => m.status === "APPROVED").length;

  // ── Flags derived from the event log ──────────────────────────────────────
  const reminderCount = trial.events.filter((e) => e.type === TRIAL_EVENTS.CHECKIN_REMINDED).length;
  const escalations = trial.events.filter((e) => e.type === TRIAL_EVENTS.HUMAN_ESCALATED);
  const humanReplies = trial.conversations
    .flatMap((c) => c.messages)
    .filter((m) => m.from === "human");
  const unresolvedEscalation = escalations.some(
    (esc) => !humanReplies.some((r) => r.timestamp > esc.timestamp),
  );

  const flags = {
    humanEscalated: escalations.length > 0,
    unresolvedEscalation,
    reminderCount,
    blockerReported: trial.events.some((e) => e.type === TRIAL_EVENTS.BLOCKER_REPORTED),
    accommodationsActive: trial.accommodationsActive,
  };

  // ── Timeline ──────────────────────────────────────────────────────────────
  const entries: TimelineEntry[] = trial.events.map((e) => ({
    id: e.id,
    day: e.day,
    actor: e.actor,
    type: e.type,
    label: e.label,
    timestamp: e.timestamp.toISOString(),
    data: e.dataJson,
  }));

  // ── AI summary — compiled by a parallel agent's generator; absent for now ──
  // (typed via `as` so it doesn't narrow to the `null` literal — the console
  // renders gracefully when the generator hasn't populated it yet.)
  const aiSummary = null as ReviewerAiSummary | null;

  // ── Rubric rows: event-driven evidence + mission-kind evidence ────────────
  const evidence = rubricEvidenceCounts(trial.events.map((e) => e.type));
  for (const m of missions) {
    const submitted = m.status !== "NOT_STARTED" && m.status !== "IN_PROGRESS";
    if (!submitted) continue;
    if (m.template.kind === "sop") evidence.scout += 1;
    if (m.template.kind === "branch") evidence.spec += 1;
  }
  const rubricRows: RubricRowView[] = RUBRIC_DIMENSIONS.map((d) => ({
    key: d.key,
    label: d.label,
    weight: d.weight,
    core: d.core,
    evidenceCount: evidence[d.key],
    aiSuggested: aiSummary?.aiSuggestedScores?.[d.key],
  }));

  // ── Artifacts that went through a feedback / revision cycle ───────────────
  const missionArtifacts: MissionArtifact[] = missions
    .filter(
      (m) =>
        m.feedbackJson ||
        m.revisionPlan ||
        m.initialText1 ||
        m.initialText2 ||
        m.initialLink,
    )
    .map((m) => ({
      id: m.id,
      title: m.template.title,
      clientName: m.template.clientName,
      kindLabel: m.template.kindLabel,
      initialText1: m.initialText1,
      initialText2: m.initialText2,
      initialLink: m.initialLink,
      submittedText1: m.submittedText1,
      submittedText2: m.submittedText2,
      submittedLink: m.submittedLink,
      feedback: (m.feedbackJson as TrialFeedback | null) ?? null,
      revisionPlan: m.revisionPlan,
    }));

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href="/recruitment/gate" style={{ color: "var(--color-sky-700)", textDecoration: "none" }}>Gate reviews</a> · Skills Trial
          </div>
          <h1>{candidateName}</h1>
        </div>
        <span className="small">Simulated work week · Day {day}</span>
      </div>

      <ConsoleHeader
        candidateId={candidateId}
        candidateName={candidateName}
        email={trial.candidate.email}
        day={day}
        approvedCount={approvedCount}
        totalSteps={totalSteps}
        statusLabel={STATUS_LABEL[trial.status] ?? trial.status}
        flags={flags}
        canReview={canReview}
      />

      <AiSummaryCard summary={aiSummary} />

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.6fr) minmax(320px, 1fr)", gap: 16, alignItems: "start" }}>
        {/* Evidence column */}
        <div style={{ minWidth: 0 }}>
          <TimelinePanel entries={entries} />
          <CompetencyExplorer entries={entries} />
          <ArtifactComparison missions={missionArtifacts} />
        </div>

        {/* Scoring + decision rail */}
        <div style={{ position: "sticky", top: 16, minWidth: 0 }}>
          <Card>
            <div style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", fontWeight: 700, marginBottom: 12 }}>
              Rubric &amp; final decision
            </div>
            {canReview ? (
              <ReviewPanel
                candidateId={candidateId}
                rows={rubricRows}
                hasUnresolvedEscalation={unresolvedEscalation}
              />
            ) : (
              <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>
                You have read-only access. Only gate reviewers can score and decide.
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
