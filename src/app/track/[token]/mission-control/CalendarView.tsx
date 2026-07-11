// Screen 7 — Weekly calendar. Seven columns (Day 1–7) marking each step's due
// day, the daily check-in window, and the Day-5 live standup. "Today" is
// highlighted from trial.currentDay.

import type { TrialStateResponse, TrialStepView } from "@/lib/trial/types";
import { KIND_META } from "./lib";
import { Card } from "./ui";

export function CalendarView({ state }: { state: TrialStateResponse }) {
  const { trial, steps } = state;
  const days = [1, 2, 3, 4, 5, 6, 7];
  const byDay = (d: number) => steps.filter((s) => s.dayDue === d).sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 className="mc-display" style={{ fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>Your week</h1>
        <p style={{ color: "var(--mc-ink-2)", margin: 0, fontSize: 14.5 }}>
          Deadlines, check-in windows, and the live standup — mapped across the trial.
        </p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(150px, 1fr))", gap: 12, minWidth: 760 }}>
          {days.map((d) => {
            const today = d === trial.currentDay;
            const past = d < trial.currentDay;
            const items = byDay(d);
            return (
              <Card key={d} className="mc-card-pad" style={{
                padding: 14, minHeight: 220, display: "flex", flexDirection: "column", gap: 8,
                borderColor: today ? "var(--mc-sky)" : undefined,
                background: today ? "#f0fbff" : past ? "#fbfaf7" : "var(--mc-surface)",
              }}>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                  <div>
                    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", color: "var(--mc-ink-3)" }}>DAY</div>
                    <div className="mc-display" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: today ? "var(--mc-navy)" : "var(--mc-ink)" }}>{d}</div>
                  </div>
                  {today && <span className="mc-badge" data-tone="active">Today</span>}
                </div>

                {items.map((s) => <DueChip key={s.missionId} step={s} />)}

                {/* Daily rhythm markers */}
                <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: 5, paddingTop: 6 }}>
                  {d === 5 && <Marker color="#5b45c9" bg="#ece8ff" label="🎥 Live team standup" />}
                  <Marker color="var(--mc-sky-ink)" bg="#e2f4fb" label="✓ Daily check-in" />
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: "var(--mc-ink-3)", margin: 0 }}>
        Reliability is only measured inside your declared windows ({trial.declaredBlock},{" "}
        {trial.declaredDays.join(" · ")}) — so time zones never count against you.
      </p>
    </div>
  );
}

function DueChip({ step }: { step: TrialStepView }) {
  const meta = KIND_META[step.kind];
  const done = step.status === "APPROVED";
  return (
    <div style={{
      display: "flex", gap: 7, alignItems: "flex-start", padding: "7px 9px", borderRadius: 10,
      background: done ? "var(--mc-success-bg)" : "#f4f3ee", fontSize: 12.5, lineHeight: 1.35,
    }}>
      <span style={{ fontSize: 14 }}>{meta.icon}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 600, color: done ? "var(--mc-success-dark)" : "var(--mc-ink)" }}>
          {done ? "✓ " : ""}{step.title}
        </span>
        <span style={{ display: "block", fontSize: 11, color: "var(--mc-ink-3)" }}>{step.clientName}</span>
      </span>
    </div>
  );
}

function Marker({ color, bg, label }: { color: string; bg: string; label: string }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color, background: bg, borderRadius: 8, padding: "4px 8px" }}>{label}</div>
  );
}
