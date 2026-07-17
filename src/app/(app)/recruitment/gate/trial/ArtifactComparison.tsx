// Artifact Comparison View (doc 08 §3 Screen 5): for each mission that went
// through a feedback/revision cycle, show the first submission beside the
// current one, with Sarah's feedback card between them and the candidate's
// revision plan below.

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import type { TrialFeedback } from "@/lib/trial/types";

export interface MissionArtifact {
  id: string;
  title: string;
  clientName: string;
  kindLabel: string;
  initialText1: string | null;
  initialText2: string | null;
  initialLink: string | null;
  submittedText1: string | null;
  submittedText2: string | null;
  submittedLink: string | null;
  feedback: TrialFeedback | null;
  revisionPlan: string | null;
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  const isLink = /^https?:\/\//i.test(value);
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", fontWeight: 700, marginBottom: 2 }}>
        {label}
      </div>
      {isLink ? (
        <a href={value} target="_blank" rel="noreferrer" style={{ fontSize: "var(--text-xs)", color: "var(--color-sky-700)", wordBreak: "break-all" }}>
          {value}
        </a>
      ) : (
        <div style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", color: "var(--color-text-secondary)", wordBreak: "break-word" }}>{value}</div>
      )}
    </div>
  );
}

const panel: React.CSSProperties = { background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", padding: 12, minWidth: 0 };

export function ArtifactComparison({ missions }: { missions: MissionArtifact[] }) {
  if (missions.length === 0) {
    return (
      <Card style={{ marginBottom: 16 }}>
        <div style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", fontWeight: 700, marginBottom: 8 }}>
          Artifact comparison
        </div>
        <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>
          No missions went through a feedback/revision cycle.
        </div>
      </Card>
    );
  }

  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--color-text-tertiary)", fontWeight: 700, marginBottom: 12 }}>
        Artifact comparison — before vs. after feedback
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {missions.map((m) => {
          const hasInitial = m.initialText1 || m.initialText2 || m.initialLink;
          return (
            <div key={m.id} style={{ borderTop: "1px solid var(--color-border-subtle)", paddingTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: "var(--text-md)" }}>{m.title}</span>
                <span style={{ display: "flex", gap: 6 }}>
                  <Badge variant="default" size="sm">{m.kindLabel}</Badge>
                  <Badge variant="sky" size="sm">{m.clientName}</Badge>
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 12, alignItems: "start" }}>
                {/* First submission */}
                <div style={panel}>
                  <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", marginBottom: 8 }}>First submission</div>
                  {hasInitial ? (
                    <>
                      <Field label="Message / comment" value={m.initialText1} />
                      <Field label="Draft / fields" value={m.initialText2} />
                      <Field label="Link" value={m.initialLink} />
                    </>
                  ) : (
                    <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>No prior snapshot.</div>
                  )}
                </div>

                {/* Sarah feedback — between the two submissions */}
                <div style={{ ...panel, background: "var(--color-warning-light)", border: "1px solid rgba(255,179,64,0.28)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontWeight: 700, fontSize: "var(--text-sm)", color: "var(--color-warning-dark)" }}>Sarah's feedback</span>
                  </div>
                  {m.feedback ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: "var(--text-xs)", color: "var(--color-warning-dark)" }}>
                      <div><strong>Observation:</strong> {m.feedback.obs}</div>
                      <div><strong>Impact:</strong> {m.feedback.impact}</div>
                      <div><strong>Suggestion:</strong> {m.feedback.sugg}</div>
                      <div style={{ fontStyle: "italic" }}>{m.feedback.enc}</div>
                    </div>
                  ) : (
                    <div className="small" style={{ fontStyle: "italic", color: "var(--color-warning-dark)" }}>No feedback recorded.</div>
                  )}
                </div>

                {/* Current submission */}
                <div style={panel}>
                  <div style={{ fontWeight: 700, fontSize: "var(--text-sm)", marginBottom: 8 }}>Current submission</div>
                  <Field label="Message / comment" value={m.submittedText1} />
                  <Field label="Draft / fields" value={m.submittedText2} />
                  <Field label="Link" value={m.submittedLink} />
                  {!m.submittedText1 && !m.submittedText2 && !m.submittedLink && (
                    <div className="small" style={{ fontStyle: "italic", color: "var(--color-text-tertiary)" }}>Not resubmitted yet.</div>
                  )}
                </div>
              </div>

              {m.revisionPlan && (
                <div style={{ marginTop: 10, background: "var(--color-bg-secondary)", borderRadius: "var(--radius-lg)", padding: 12 }}>
                  <div style={{ fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--color-text-tertiary)", fontWeight: 700, marginBottom: 4 }}>
                    Candidate revision plan &amp; ETA
                  </div>
                  <div style={{ fontSize: "var(--text-sm)", whiteSpace: "pre-wrap", color: "var(--color-text-secondary)" }}>{m.revisionPlan}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
