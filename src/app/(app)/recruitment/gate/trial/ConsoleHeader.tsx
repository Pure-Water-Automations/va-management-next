// Console header (doc 08 §3 Screen 2): candidate identity, current trial day,
// approved-steps tally, alert flag chips derived from the event log, and the
// reviewer accommodation toggle.

import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { ActionButton } from "@/components/ActionButton";

export interface HeaderFlags {
  humanEscalated: boolean;
  unresolvedEscalation: boolean;
  reminderCount: number;
  blockerReported: boolean;
  accommodationsActive: boolean;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function ConsoleHeader({
  candidateId,
  candidateName,
  email,
  day,
  approvedCount,
  totalSteps,
  statusLabel,
  flags,
  canReview,
}: {
  candidateId: string;
  candidateName: string;
  email: string;
  day: number;
  approvedCount: number;
  totalSteps: number;
  statusLabel: string;
  flags: HeaderFlags;
  canReview: boolean;
}) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: "50%",
              background: "linear-gradient(145deg, var(--color-navy-800) 0%, var(--color-navy-900) 100%)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
              fontSize: "var(--text-md)",
              flexShrink: 0,
            }}
          >
            {initials(candidateName)}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "var(--text-lg)" }}>{candidateName}</div>
            <div className="small">{email}</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <Badge variant="primary">Day {day}</Badge>
          <Badge variant={approvedCount >= totalSteps ? "success" : "info"}>
            {approvedCount}/{totalSteps} steps approved
          </Badge>
          <Badge variant="default">{statusLabel}</Badge>
        </div>
      </div>

      {/* Alert flag chips */}
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap", alignItems: "center" }}>
        {flags.humanEscalated && (
          <Badge variant={flags.unresolvedEscalation ? "danger" : "warning"} dot>
            {flags.unresolvedEscalation ? "Human escalation — unresolved" : "Human escalation — answered"}
          </Badge>
        )}
        {flags.reminderCount >= 2 && (
          <Badge variant="warning" dot>{flags.reminderCount} check-in reminders</Badge>
        )}
        {flags.blockerReported && <Badge variant="warning" dot>Blocker reported</Badge>}
        {flags.accommodationsActive && <Badge variant="info" dot>Accommodations active</Badge>}
        {!flags.humanEscalated && flags.reminderCount < 2 && !flags.blockerReported && !flags.accommodationsActive && (
          <span className="small" style={{ color: "var(--color-text-tertiary)" }}>No active flags.</span>
        )}
        {canReview && (
          <span style={{ marginLeft: "auto" }}>
            <ActionButton
              path="/api/trials/review/accommodation"
              body={{ candidateId }}
              variant="ghost"
              confirm={
                flags.accommodationsActive
                  ? "Clear active accommodations for this candidate?"
                  : "Mark active accommodations? This pauses reminder counts and excludes latency from scoring suggestions."
              }
            >
              {flags.accommodationsActive ? "Clear accommodations" : "Mark active accommodations"}
            </ActionButton>
          </span>
        )}
      </div>
    </Card>
  );
}
