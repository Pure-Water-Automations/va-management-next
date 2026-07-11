// Screen 4 — Project overview. Responsive card grid of all steps, in program
// order, with locked / available / done affordances derived from status + dayDue.

import type { TrialStepView } from "@/lib/trial/types";
import { isLocked, KIND_META, STATUS_META } from "./lib";
import { Badge, Card, Icon } from "./ui";

export function Missions({
  steps,
  currentDay,
  onOpen,
}: {
  steps: TrialStepView[];
  currentDay: number;
  onOpen: (missionId: string) => void;
}) {
  const ordered = [...steps].sort((a, b) => a.sortOrder - b.sortOrder);
  const done = steps.filter((s) => s.status === "APPROVED").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
        <div>
          <h1 className="mc-display" style={{ fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>Your missions</h1>
          <p style={{ color: "var(--mc-ink-2)", margin: 0, fontSize: 14.5 }}>
            The whole arc of your week — {steps.length} steps, one client world.
          </p>
        </div>
        <span className="mc-chip"><Icon path="M9 11l3 3 8-8" size={13} />{done} of {steps.length} approved</span>
      </div>

      <div className="mc-grid-missions">
        {ordered.map((step) => (
          <MissionCard key={step.missionId} step={step} locked={isLocked(step, currentDay)} onOpen={() => onOpen(step.missionId)} />
        ))}
      </div>
    </div>
  );
}

function MissionCard({ step, locked, onOpen }: { step: TrialStepView; locked: boolean; onOpen: () => void }) {
  const meta = KIND_META[step.kind];
  const status = STATUS_META[step.status];
  const done = step.status === "APPROVED";
  return (
    <Card
      className="mc-card-pad"
      onClick={onOpen}
      style={{
        cursor: "pointer",
        opacity: locked ? 0.62 : 1,
        transition: "transform .1s, box-shadow .15s",
        display: "flex",
        flexDirection: "column",
        gap: 10,
        minHeight: 200,
        ...(done ? { borderColor: "#bfe9d1" } : step.status === "NEEDS_REVISION" ? { borderColor: "var(--mc-warn-border)" } : {}),
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span className="mc-kindtag">{step.kindLabel}</span>
        {locked ? (
          <span className="mc-badge" data-tone="neutral"><Icon path="M6 10V8a6 6 0 0 1 12 0v2M5 10h14v10H5z" size={11} />Day {step.dayDue}</span>
        ) : (
          <Badge tone={status.tone}>{status.label}</Badge>
        )}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ fontSize: 24, lineHeight: 1 }}>{meta.icon}</div>
        <h3 className="mc-display" style={{ fontSize: 17, fontWeight: 800, margin: 0, lineHeight: 1.2 }}>{step.title}</h3>
      </div>

      <p style={{ color: "var(--mc-ink-2)", fontSize: 13, lineHeight: 1.55, margin: 0, flex: 1,
        display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
        {step.story}
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span className="mc-chip" style={{ fontSize: 11.5, padding: "3px 8px" }}>{step.clientName}</span>
        <span className="mc-chip" style={{ fontSize: 11.5, padding: "3px 8px" }}>~{step.estMinutes}m</span>
        {done && <span style={{ marginLeft: "auto", color: "var(--mc-success-dark)", fontSize: 12.5, fontWeight: 700 }}>✓ Done</span>}
        {locked && <span style={{ marginLeft: "auto", color: "var(--mc-ink-3)", fontSize: 12, fontWeight: 600 }}>Unlocks Day {step.dayDue}</span>}
      </div>
    </Card>
  );
}
