// Screen 3 — Mission Control Home. Left: focus card for the current actionable
// step + recent messages preview. Right rail: calendar peek, quick actions, and
// Purii's contextual speech bubble. When the trial is submitted the focus card
// is replaced by the green "awaiting review" completion banner (Screen 13).

import { useEffect, useState } from "react";
import type { TrialMessageView, TrialStateResponse, TrialStepView } from "@/lib/trial/types";
import { fetchMessages, KIND_META, STATUS_META } from "./lib";
import { Badge, Card, Icon } from "./ui";

export function Home({
  state,
  focus,
  onOpenMission,
  onOpenMessages,
  onReportBlocker,
  onCheckIn,
}: {
  state: TrialStateResponse;
  focus: TrialStepView | null;
  onOpenMission: (missionId: string) => void;
  onOpenMessages: () => void;
  onReportBlocker: () => void;
  onCheckIn: () => void;
}) {
  const { trial, steps } = state;
  const submitted = trial.status === "SUBMITTED" || trial.status === "COMPLETED";
  const firstName = (trial.candidateName ?? "there").split(" ")[0];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <h1 className="mc-display" style={{ fontSize: 26, fontWeight: 800, margin: "0 0 2px" }}>
          {greeting()}, {firstName}.
        </h1>
        <p style={{ color: "var(--mc-ink-2)", margin: 0, fontSize: 14.5 }}>
          {submitted ? "Your trial week is complete." : "Here's what deserves your attention today."}
        </p>
      </div>

      <div className="mc-grid-home">
        {/* Left column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {submitted ? (
            <CompletionBanner />
          ) : focus ? (
            <FocusCard step={focus} onOpen={() => onOpenMission(focus.missionId)} />
          ) : (
            <AllClearCard />
          )}
          <MessagesPreview state={state} onOpenMessages={onOpenMessages} />
        </div>

        {/* Right rail */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <CalendarPeek steps={steps} currentDay={trial.currentDay} />
          <QuickActions onReportBlocker={onReportBlocker} onCheckIn={onCheckIn} />
          <PuriiBubble state={state} focus={focus} submitted={submitted} />
        </div>
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

function FocusCard({ step, onOpen }: { step: TrialStepView; onOpen: () => void }) {
  const meta = KIND_META[step.kind];
  const status = STATUS_META[step.status];
  const revision = step.status === "NEEDS_REVISION";
  return (
    <Card className="mc-card-pad" style={revision ? { borderColor: "var(--mc-warn-border)" } : undefined}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <span className="mc-kindtag">Your focus · {step.kindLabel}</span>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ fontSize: 30, lineHeight: 1 }}>{meta.icon}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 className="mc-display" style={{ fontSize: 21, fontWeight: 800, margin: "0 0 6px" }}>{step.title}</h2>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            <span className="mc-chip"><Icon path="M4 7h16M4 12h16M4 17h10" size={13} />{step.clientName}</span>
            <span className="mc-chip"><Icon path="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z" size={13} />~{step.estMinutes} min</span>
            <span className="mc-chip">Due Day {step.dayDue}</span>
          </div>
          <p style={{ color: "var(--mc-ink-2)", fontSize: 14, lineHeight: 1.6, margin: "0 0 16px" }}>{step.story}</p>
          <button className="mc-btn mc-btn-primary" onClick={onOpen}>
            {revision ? "Review feedback & revise" : step.status === "IN_PROGRESS" ? "Continue" : meta.verb} →
          </button>
        </div>
      </div>
    </Card>
  );
}

function CompletionBanner() {
  return (
    <Card className="mc-card-pad" style={{ background: "linear-gradient(150deg, #e5f7ee, #eafaf1)", borderColor: "#bfe9d1" }}>
      <div style={{ display: "flex", gap: 14, alignItems: "flex-start" }}>
        <div style={{ fontSize: 34, lineHeight: 1 }}>✅</div>
        <div>
          <h2 className="mc-display" style={{ fontSize: 21, fontWeight: 800, margin: "0 0 6px", color: "var(--mc-success-dark)" }}>
            Your evidence package is compiled
          </h2>
          <p style={{ color: "#2c6b4a", fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>
            Everything you completed this week has been gathered and is now awaiting review by a human
            on the Pure Water team. There&apos;s nothing more you need to do — we&apos;ll be in touch by email.
            Thank you for the care you put in.
          </p>
        </div>
      </div>
    </Card>
  );
}

function AllClearCard() {
  return (
    <Card className="mc-card-pad" style={{ textAlign: "center" }}>
      <img src="/purii/thumbs-up.png" alt="" style={{ height: 72, objectFit: "contain" }} />
      <h2 className="mc-display" style={{ fontSize: 20, fontWeight: 800, margin: "8px 0 4px" }}>You&apos;re all caught up</h2>
      <p style={{ color: "var(--mc-ink-2)", fontSize: 14, margin: 0 }}>
        No step needs you right now. New work opens as the week unfolds — check the calendar for what&apos;s ahead.
      </p>
    </Card>
  );
}

function MessagesPreview({ state, onOpenMessages }: { state: TrialStateResponse; onOpenMessages: () => void }) {
  const [msgs, setMsgs] = useState<TrialMessageView[] | null>(null);
  const token = useTokenFromState();
  useEffect(() => {
    let alive = true;
    if (!token) return;
    void fetchMessages(token).then((res) => {
      if (!alive) return;
      if (res.ok) {
        const flat = res.conversations.flatMap((c) => c.messages);
        flat.sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
        setMsgs(flat.slice(0, 4));
      } else setMsgs([]);
    });
    return () => { alive = false; };
  }, [token]);

  return (
    <Card className="mc-card-pad">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 className="mc-section-title" style={{ margin: 0 }}>Recent messages</h3>
        <button className="mc-btn mc-btn-ghost mc-btn-sm" onClick={onOpenMessages}>Open inbox</button>
      </div>
      {msgs === null ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="mc-skel" style={{ height: 40 }} /><div className="mc-skel" style={{ height: 40 }} />
        </div>
      ) : msgs.length === 0 ? (
        <p style={{ color: "var(--mc-ink-3)", fontSize: 14, margin: 0 }}>No messages yet — your team will reach out as the week begins.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {msgs.map((m) => (
            <div key={m.id} style={{ display: "flex", gap: 10 }}>
              <div className="mc-avatar" style={{ width: 30, height: 30, flex: "0 0 30px", fontSize: 11 }}>{m.from.slice(0, 2).toUpperCase()}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, textTransform: "capitalize" }}>
                  {m.actorType}{m.actorType !== "Human" && <span className="mc-ai-badge" style={{ marginLeft: 6, background: "#eef0f4", color: "#5b6472" }}>✦ AI</span>}
                </div>
                <div style={{ fontSize: 13.5, color: "var(--mc-ink-2)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{m.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}
      {/* keep state referenced for future preview enrichments */}
      <span style={{ display: "none" }}>{state.trial.id}</span>
    </Card>
  );
}

// The token lives on window path /track/<token>/… — pull it once for the preview
// fetch without threading it through every Home prop.
function useTokenFromState(): string | null {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    const m = window.location.pathname.match(/\/track\/([^/]+)/);
    setT(m ? decodeURIComponent(m[1]) : null);
  }, []);
  return t;
}

function CalendarPeek({ steps, currentDay }: { steps: TrialStepView[]; currentDay: number }) {
  const upcoming = [...steps]
    .filter((s) => s.status !== "APPROVED")
    .sort((a, b) => a.dayDue - b.dayDue || a.sortOrder - b.sortOrder)
    .slice(0, 4);
  return (
    <Card className="mc-card-pad">
      <h3 className="mc-section-title">This week</h3>
      {upcoming.length === 0 ? (
        <p style={{ color: "var(--mc-ink-3)", fontSize: 13.5, margin: 0 }}>Nothing scheduled.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {upcoming.map((s) => {
            const overdue = s.dayDue < currentDay;
            return (
              <div key={s.missionId} style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{
                  width: 38, flex: "0 0 38px", textAlign: "center", borderRadius: 10, padding: "4px 0",
                  background: overdue ? "#fde8e8" : "#eef2ff", color: overdue ? "#a01a1a" : "var(--mc-navy)",
                }}>
                  <div style={{ fontSize: 9, fontWeight: 800, letterSpacing: ".06em" }}>DAY</div>
                  <div className="mc-display" style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{s.dayDue}</div>
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</div>
                  <div style={{ fontSize: 12, color: "var(--mc-ink-3)" }}>{s.clientName}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function QuickActions({ onReportBlocker, onCheckIn }: { onReportBlocker: () => void; onCheckIn: () => void }) {
  return (
    <Card className="mc-card-pad">
      <h3 className="mc-section-title">Quick actions</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <button className="mc-btn mc-btn-ghost" style={{ justifyContent: "flex-start", width: "100%" }} onClick={onReportBlocker}>
          <Icon path="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" size={16} />
          Report a blocker
        </button>
        <button className="mc-btn mc-btn-ghost" style={{ justifyContent: "flex-start", width: "100%" }} onClick={onCheckIn}>
          <Icon path="M9 11l3 3 8-8M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" size={16} />
          Check in now
        </button>
      </div>
    </Card>
  );
}

function PuriiBubble({ state, focus, submitted }: { state: TrialStateResponse; focus: TrialStepView | null; submitted: boolean }) {
  const copy = puriiCopy(state, focus, submitted);
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
      <img src="/purii/happy.png" alt="Purii" style={{ height: 52, objectFit: "contain", flex: "0 0 auto" }} />
      <div className="mc-speech" style={{ flex: 1 }}>
        <div style={{ marginBottom: 5 }}><span className="mc-ai-badge">✦ Purii · AI</span></div>
        {copy}
      </div>
    </div>
  );
}

function puriiCopy(state: TrialStateResponse, focus: TrialStepView | null, submitted: boolean): string {
  if (submitted) return "That's a wrap — your work is with the team now. Rest easy; a human will take it from here.";
  const revision = state.steps.find((s) => s.status === "NEEDS_REVISION");
  if (revision) return `Sarah left notes on "${revision.title}". Take a breath — feedback here is how we build trust, not a knock. Open it when you're ready.`;
  if (!focus) return "You're beautifully on top of things. I'll ping you the moment something new opens up.";
  if (focus.status === "IN_PROGRESS") return `You're mid-flight on "${focus.title}". Remember: reliable delivery first, then scout the system. Don't forget your end-of-day check-in.`;
  return `Ready when you are for "${focus.title}". Start the timer when you begin so we only ever count real effort.`;
}
