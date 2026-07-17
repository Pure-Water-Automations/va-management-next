// Screen 11 — Progress & trust growth. Qualitative ONLY: no numeric rubric
// scores, no XP / points / streaks (DEC-007). Five trust dimensions shown as
// directional bars with word captions, plus the Responsibility Ladder with the
// candidate's current standing marked. Final judgment is always a human's.

import type { TrialStateResponse } from "@/lib/trial/types";
import { qualitativeLevel, TRUST_DIMENSIONS, TRUST_LADDER } from "./lib";
import { Card } from "./ui";

export function Progress({ state, trustLabel }: { state: TrialStateResponse; trustLabel: string }) {
  const { steps } = state;
  const approved = steps.filter((s) => s.status === "APPROVED").length;
  const engaged = steps.filter((s) => s.status !== "NOT_STARTED").length;
  const overall = steps.length ? approved / steps.length : 0;

  // Directional signal per dimension — deliberately coarse; the caption is a
  // word, never a number. Slight per-dimension variation keeps it honest that
  // these grow at different rates, without implying a precise score.
  const signals = TRUST_DIMENSIONS.map((dim, i) => {
    const base = engaged ? Math.min(1, (approved + (i % 2 === 0 ? 0.4 : 0.2) * (engaged - approved)) / steps.length) : 0;
    return { ...dim, ratio: Math.max(overall * 0.6, base) };
  });

  const currentIdx = TRUST_LADDER.indexOf(trustLabel as (typeof TRUST_LADDER)[number]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <div>
        <h1 className="mc-display" style={{ fontSize: 24, fontWeight: 800, margin: "0 0 2px" }}>Your growth</h1>
        <p style={{ color: "var(--mc-ink-2)", margin: 0, fontSize: 14.5 }}>
          Trust is earned through responsibility — not points or streaks. This is directional; a human makes the final call.
        </p>
      </div>

      <div className="mc-grid-home">
        {/* Trust dimensions */}
        <Card className="mc-card-pad">
          <h3 className="mc-section-title">Trust dimensions</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
            {signals.map((s) => (
              <div key={s.key}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 5 }}>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{s.label}</span>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--mc-sky-ink)" }}>{qualitativeLevel(s.ratio)}</span>
                </div>
                <div className="mc-track"><div className="mc-fill" style={{ width: `${Math.round(s.ratio * 100)}%` }} /></div>
                <p style={{ fontSize: 12, color: "var(--mc-ink-3)", margin: "5px 0 0" }}>{s.blurb}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Responsibility ladder */}
        <Card className="mc-card-pad">
          <h3 className="mc-section-title">Responsibility ladder</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
            {[...TRUST_LADDER].map((rung, i) => {
              const reached = i <= currentIdx;
              const current = i === currentIdx;
              return (
                <div key={rung} style={{ display: "flex", gap: 11, alignItems: "center", padding: "9px 10px", borderRadius: 12, background: current ? "#eef2ff" : "transparent" }}>
                  <div style={{
                    width: 22, height: 22, flex: "0 0 22px", borderRadius: "50%", display: "grid", placeItems: "center",
                    background: reached ? "var(--mc-navy)" : "var(--mc-bg-tertiary, #ece9e2)",
                    color: reached ? "#fff" : "var(--mc-ink-3)", fontSize: 11, fontWeight: 800,
                  }}>{reached ? "✓" : i + 1}</div>
                  <span style={{ fontSize: 13.5, fontWeight: current ? 700 : 500, color: reached ? "var(--mc-ink)" : "var(--mc-ink-3)" }}>
                    {rung}{current && <span style={{ color: "var(--mc-sky-ink)", fontWeight: 700 }}> · you are here</span>}
                  </span>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 12, color: "var(--mc-ink-3)", margin: "12px 0 0", lineHeight: 1.55 }}>
            The reward for good work is more trust and higher-tier responsibility — not badges.
          </p>
        </Card>
      </div>

      <Card className="mc-card-pad" style={{ background: "#fbfaf7" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <img src="/purii/open-arms.png" alt="" style={{ height: 48, objectFit: "contain" }} />
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--mc-ink-2)", lineHeight: 1.55 }}>
            You&apos;ve completed <strong>{approved}</strong> of <strong>{steps.length}</strong> steps so far. Keep delivering
            reliably and communicating early — that&apos;s what earns trust here.
          </p>
        </div>
      </Card>
    </div>
  );
}
