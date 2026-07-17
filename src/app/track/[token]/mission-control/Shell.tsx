// Sidebar (224px) + sticky HUD header + mobile bottom-tab bar. Wraps every
// authenticated view. The HUD hosts the day chip, active-time accumulator, the
// running timer widget (pause control), and the "Ask a person" escalation.

import type { ReactNode } from "react";
import type { TrialStateResponse, TrialStepView } from "@/lib/trial/types";
import { fmtClock, fmtHours, initials, NAV_ITEMS, type NavKey } from "./lib";
import { Icon } from "./ui";

export function Shell({
  state,
  trustLabel,
  nav,
  onNav,
  runningStep,
  liveSeconds,
  onPauseTimer,
  pausing,
  onAskPerson,
  children,
}: {
  state: TrialStateResponse;
  trustLabel: string;
  nav: NavKey;
  onNav: (k: NavKey) => void;
  runningStep: TrialStepView | null;
  liveSeconds: number;
  onPauseTimer: () => void;
  pausing: boolean;
  onAskPerson: () => void;
  children: ReactNode;
}) {
  const { trial } = state;
  const activeTotal = trial.activeSeconds + (runningStep ? liveSeconds : 0);

  return (
    <div className="mc-root">
      <div className="mc-layout">
        {/* Sidebar */}
        <aside className="mc-sidebar">
          <div className="mc-brand">
            <div className="mc-brand-mark">PW</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, lineHeight: 1.1 }}>Pure Water</div>
              <div style={{ fontSize: 11, color: "var(--mc-ink-3)", fontWeight: 600, letterSpacing: ".04em" }}>TRIAL</div>
            </div>
          </div>

          <nav className="mc-nav">
            {NAV_ITEMS.map((item) => (
              <button key={item.key} className="mc-nav-item" data-active={nav === item.key} onClick={() => onNav(item.key)}>
                <Icon path={item.icon} />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mc-profile">
            <div className="mc-profile-card">
              <div className="mc-avatar">{initials(trial.candidateName)}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {trial.candidateName ?? "Candidate"}
                </div>
                <div style={{ fontSize: 11, color: "var(--mc-sky-ink)", fontWeight: 700 }}>{trustLabel}</div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <div className="mc-main">
          <header className="mc-hud">
            <span className="mc-chip">
              <span style={{ color: "var(--mc-navy)", fontWeight: 700 }}>Day {trial.currentDay}</span>&nbsp;of 7
            </span>
            <span className="mc-chip mono" title="Total active time this trial">
              <Icon path="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" size={14} />
              {fmtHours(activeTotal)}h / 10h
            </span>

            {runningStep && (
              <span className="mc-chip mono" style={{ borderColor: "var(--mc-sky)", background: "#eafaff", color: "var(--mc-sky-ink)" }}>
                <span style={{ width: 7, height: 7, borderRadius: 999, background: "var(--mc-sky)", display: "inline-block" }} />
                {fmtClock(runningStep.secondsSpent + liveSeconds)}
                <button
                  onClick={onPauseTimer}
                  disabled={pausing}
                  title="Pause timer"
                  style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--mc-sky-ink)", padding: 0, marginLeft: 2, display: "inline-flex" }}
                >
                  <Icon path="M9 5v14M15 5v14" size={15} />
                </button>
              </span>
            )}

            <div className="mc-hud-spacer" />

            <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={onAskPerson} title="Reach a real person">
              <Icon path="M12 2a5 5 0 0 1 5 5c0 3-5 4-5 7M12 17h.01M4 20a8 8 0 0 1 16 0" size={15} />
              Ask a person
            </button>
          </header>

          <main className="mc-content">{children}</main>
        </div>
      </div>

      {/* Mobile bottom nav */}
      <nav className="mc-bottomnav">
        {NAV_ITEMS.map((item) => (
          <button key={item.key} data-active={nav === item.key} onClick={() => onNav(item.key)}>
            <Icon path={item.icon} size={20} />
            {item.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
