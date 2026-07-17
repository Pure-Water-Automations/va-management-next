"use client";

// Root of the candidate Mission Control app. Fetches GET /api/trials/steps with
// a bearer token, holds trial state, runs the active-timer clock, and routes
// between views client-side (useState — no nested Next routes inside the token
// page). Renders Onboarding until the trial is acknowledged; a completion banner
// once the evidence package is submitted.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AcknowledgeRequest,
  StepSubmitRequest,
  StepSubmitResponse,
  TrialStateResponse,
} from "@/lib/trial/types";
import { api, fetchState, focusStep, trustStanding, type NavKey } from "./lib";
import { CenteredCard, GlobalStyle, Skeleton } from "./ui";
import { Onboarding } from "./Onboarding";
import { Shell } from "./Shell";
import { Home } from "./Home";
import { Missions } from "./Missions";
import { MissionDetail } from "./MissionDetail";
import { Messages } from "./Messages";
import { CalendarView } from "./CalendarView";
import { Progress } from "./Progress";
import { Resources } from "./Resources";
import { BlockerModal, EscalateModal } from "./Modals";

type ModalKind = null | "blocker" | "human";

export function MissionControl({ token }: { token: string }) {
  const [state, setState] = useState<TrialStateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [completionStatus, setCompletionStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [nav, setNav] = useState<NavKey>("home");
  const [activeMissionId, setActiveMissionId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalKind>(null);

  const [ackSubmitting, setAckSubmitting] = useState(false);
  const [ackError, setAckError] = useState<string | null>(null);
  const [pausing, setPausing] = useState(false);

  // ── Data ──────────────────────────────────────────────────────────────
  const refresh = useCallback(async () => {
    const res = await fetchState(token);
    if (!res.ok) {
      setError(res.error);
      setCompletionStatus(res.completionStatus ?? null);
      setState(null);
    } else {
      setError(null);
      setCompletionStatus(null);
      setState(res);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => { void refresh(); }, [refresh]);

  // ── Active timer clock ────────────────────────────────────────────────
  const runningStep = useMemo(
    () => state?.steps.find((s) => s.timerRunning) ?? null,
    [state],
  );
  const [liveSeconds, setLiveSeconds] = useState(0);
  const anchorRef = useRef<{ id: string; startMs: number } | null>(null);

  useEffect(() => {
    if (!runningStep) {
      anchorRef.current = null;
      setLiveSeconds(0);
      return;
    }
    if (!anchorRef.current || anchorRef.current.id !== runningStep.missionId) {
      anchorRef.current = { id: runningStep.missionId, startMs: Date.now() };
    }
    const tick = () => {
      if (anchorRef.current) setLiveSeconds(Math.floor((Date.now() - anchorRef.current.startMs) / 1000));
    };
    tick();
    const iv = window.setInterval(tick, 1000);
    return () => window.clearInterval(iv);
  }, [runningStep?.missionId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────
  const acknowledge = useCallback(async (body: AcknowledgeRequest) => {
    setAckSubmitting(true);
    setAckError(null);
    const res = await api.acknowledge(token, body);
    setAckSubmitting(false);
    if (!res.ok) {
      if (res.completionStatus) setCompletionStatus(res.completionStatus);
      setAckError(res.error);
      return;
    }
    await refresh();
  }, [token, refresh]);

  const startStep = useCallback(async (stepKey: string) => {
    const res = await api.stepStart(token, stepKey);
    if (res.ok) await refresh();
    else if (res.completionStatus) setCompletionStatus(res.completionStatus);
    return res.ok;
  }, [token, refresh]);

  const pauseStep = useCallback(async (stepKey: string) => {
    setPausing(true);
    const res = await api.stepPause(token, stepKey);
    setPausing(false);
    if (res.ok) await refresh();
    else if (res.completionStatus) setCompletionStatus(res.completionStatus);
  }, [token, refresh]);

  const submitStep = useCallback(async (body: StepSubmitRequest): Promise<StepSubmitResponse | { ok: false; error: string }> => {
    const res = await api.stepSubmit(token, body);
    if (res.ok) await refresh();
    else if (res.completionStatus) setCompletionStatus(res.completionStatus);
    return res;
  }, [token, refresh]);

  const openMission = useCallback((missionId: string) => {
    setActiveMissionId(missionId);
    setNav("missions");
    window.scrollTo({ top: 0 });
  }, []);

  const goNav = useCallback((k: NavKey) => {
    setActiveMissionId(null);
    setNav(k);
    window.scrollTo({ top: 0 });
  }, []);

  // ── Render: loading / error gates ─────────────────────────────────────
  if (loading) {
    return (
      <div className="mc-root" style={{ padding: 28 }}>
        <GlobalStyle />
        <div style={{ maxWidth: 1120, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
          <Skeleton h={40} w={280} />
          <Skeleton h={180} />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
            <Skeleton h={140} /><Skeleton h={140} /><Skeleton h={140} />
          </div>
        </div>
      </div>
    );
  }

  if (completionStatus) {
    const outcome = trialOutcome(completionStatus);
    return (
      <>
        <GlobalStyle />
        <CenteredCard emoji={outcome.emoji} title={outcome.title} body={outcome.body} />
      </>
    );
  }

  if (error || !state) {
    return (
      <>
        <GlobalStyle />
        <CenteredCard
          emoji="🔒"
          title="This workspace isn't available"
          body={error ?? "This link may have expired, or your trial has been completed. If you think this is a mistake, reply to your recruiter's email and we'll help."}
        />
      </>
    );
  }

  const { trial, steps } = state;
  const approved = steps.filter((s) => s.status === "APPROVED").length;
  const trustLabel = trustStanding(approved, steps.length);
  const focus = focusStep(steps, trial.currentDay);
  const activeMission = activeMissionId ? steps.find((s) => s.missionId === activeMissionId) ?? null : null;

  // ── Onboarding gate ───────────────────────────────────────────────────
  if (!trial.acknowledgedAt) {
    return (
      <>
        <GlobalStyle />
        <Onboarding
          defaultName={trial.candidateName}
          defaultTimezone={trial.timezone}
          onSubmit={acknowledge}
          submitting={ackSubmitting}
          error={ackError}
        />
      </>
    );
  }

  // ── Authenticated shell + view router ─────────────────────────────────
  const view = activeMission ? (
    <MissionDetail
      step={activeMission}
      currentDay={trial.currentDay}
      specializationTrack={trial.specializationTrack}
      liveSeconds={runningStep?.missionId === activeMission.missionId ? liveSeconds : 0}
      onBack={() => goNav("missions")}
      onStart={startStep}
      onPause={pauseStep}
      onSubmit={submitStep}
      onReportBlocker={() => setModal("blocker")}
    />
  ) : nav === "home" ? (
    <Home
      state={state}
      focus={focus}
      onOpenMission={openMission}
      onOpenMessages={() => goNav("messages")}
      onReportBlocker={() => setModal("blocker")}
      onCheckIn={() => goNav("messages")}
    />
  ) : nav === "missions" ? (
    <Missions steps={steps} currentDay={trial.currentDay} onOpen={openMission} />
  ) : nav === "messages" ? (
    <Messages token={token} />
  ) : nav === "calendar" ? (
    <CalendarView state={state} />
  ) : nav === "progress" ? (
    <Progress state={state} trustLabel={trustLabel} />
  ) : (
    <Resources />
  );

  return (
    <>
      <GlobalStyle />
      <Shell
        state={state}
        trustLabel={trustLabel}
        nav={nav}
        onNav={goNav}
        runningStep={runningStep}
        liveSeconds={liveSeconds}
        onPauseTimer={() => runningStep && pauseStep(runningStep.key)}
        pausing={pausing}
        onAskPerson={() => setModal("human")}
      >
        {view}
      </Shell>

      {modal === "blocker" && (
        <BlockerModal
          token={token}
          steps={steps}
          defaultStepId={activeMission?.key ?? focus?.key ?? null}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "human" && <EscalateModal token={token} onClose={() => setModal(null)} />}
    </>
  );
}

function trialOutcome(completionStatus: string): { emoji: string; title: string; body: string } {
  if (["tenhr_pass", "contract_sent", "signed", "onboarding"].includes(completionStatus)) {
    return {
      emoji: "🎉",
      title: "You passed — next steps",
      body: "Congratulations — your skills trial is complete, and we're excited to move you forward. Your recruiter will be in touch with what comes next.",
    };
  }

  if (["tenhr_fail", "closed"].includes(completionStatus)) {
    return {
      emoji: "💛",
      title: "Thanks, you were not selected",
      body: "Thank you for the time, care, and effort you put into the skills trial. We truly appreciate your interest in working with Pure Water Automations and wish you all the best in what comes next.",
    };
  }

  return {
    emoji: "✓",
    title: "This trial is complete",
    body: "Thank you for everything you shared during the skills trial. There is nothing else you need to do here; your recruiter will be in touch if there are any next steps.",
  };
}
