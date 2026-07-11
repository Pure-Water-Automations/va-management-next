// Screen 5 (+ 9 submission, 10 revision, 12 reflection) — the working screen for
// a single step. Renders the brief per MissionKind, the matching submission
// inputs, timer controls, and — when NEEDS_REVISION — the warm-yellow feedback
// card plus a required revision plan before resubmit.

import { useEffect, useMemo, useState } from "react";
import type {
  SpecializationTrack,
  StepSubmitRequest,
  StepSubmitResponse,
  TrialFeedback,
  TrialStepView,
} from "@/lib/trial/types";
import {
  checklistOf,
  clientBriefOf,
  fmtClock,
  KIND_META,
  questionsOf,
  scenarioOf,
  sopFieldsOf,
  STATUS_META,
  tracksOf,
} from "./lib";
import { Badge, Card, Icon } from "./ui";

type SubmitResult = StepSubmitResponse | { ok: false; error: string };

export function MissionDetail({
  step,
  currentDay,
  specializationTrack,
  liveSeconds,
  onBack,
  onStart,
  onPause,
  onSubmit,
  onReportBlocker,
}: {
  step: TrialStepView;
  currentDay: number;
  specializationTrack: SpecializationTrack | null;
  liveSeconds: number;
  onBack: () => void;
  onStart: (stepKey: string) => Promise<boolean>;
  onPause: (stepKey: string) => Promise<void>;
  onSubmit: (body: StepSubmitRequest) => Promise<SubmitResult>;
  onReportBlocker: () => void;
}) {
  const meta = KIND_META[step.kind];
  const status = STATUS_META[step.status];
  // A step stays "in revision" after the candidate restarts it (status moves to
  // IN_PROGRESS) — prior feedback means the engine requires a revision plan on
  // every resubmission, so keep collecting it whenever feedback exists.
  const needsRevision = step.status === "NEEDS_REVISION" || (step.feedback !== null && step.status !== "APPROVED" && step.status !== "SUBMITTED");
  const locked = step.status === "APPROVED" || step.status === "SUBMITTED";

  // ── Form state, seeded from the step (re-seeds when the step changes) ──
  const sopFields = sopFieldsOf(step);
  const questions = questionsOf(step);
  const [selected, setSelected] = useState<string | null>(step.submittedText1 || null);
  const [text1, setText1] = useState(step.submittedText1 ?? "");
  const [text2, setText2] = useState(step.submittedText2 ?? "");
  const [link, setLink] = useState(step.submittedLink ?? "");
  const [checks, setChecks] = useState<boolean[]>(() => checklistOf(step).map(() => false));
  const [sopValues, setSopValues] = useState<Record<string, string>>(() => seedJson(step.submittedText2, sopFields));
  const [reflectValues, setReflectValues] = useState<string[]>(() => seedArray(step.submittedText2, questions.length));
  const [confirmedSlot, setConfirmedSlot] = useState(false);
  const [revisionPlan, setRevisionPlan] = useState(step.revisionPlan ?? "");

  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [localFeedback, setLocalFeedback] = useState<TrialFeedback | null>(null);

  // Re-seed everything when navigating to a different mission.
  useEffect(() => {
    setSelected(step.submittedText1 || null);
    setText1(step.submittedText1 ?? "");
    setText2(step.submittedText2 ?? "");
    setLink(step.submittedLink ?? "");
    setChecks(checklistOf(step).map(() => false));
    setSopValues(seedJson(step.submittedText2, sopFieldsOf(step)));
    setReflectValues(seedArray(step.submittedText2, questionsOf(step).length));
    setConfirmedSlot(false);
    setRevisionPlan(step.revisionPlan ?? "");
    setErr(null); setFlash(null); setLocalFeedback(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step.missionId]);

  const scenario = scenarioOf(step);
  const chosen = scenario?.options.find((o) => o.id === selected) ?? null;

  const canSubmit = useMemo(() => {
    if (locked) return false;
    if (needsRevision && revisionPlan.trim().length < 4) return false;
    switch (step.kind) {
      case "learn": return !!selected;
      case "tour": return checks.every(Boolean);
      case "sim": return text1.trim().length > 3 && text2.trim().length > 3;
      case "branch": return text1.trim().length > 3;
      case "sop": return sopFields.every((f) => (sopValues[f] ?? "").trim().length > 1);
      case "meet": return confirmedSlot && text1.trim().length > 3;
      case "reflect": return reflectValues.every((v) => v.trim().length > 3);
      default: return true;
    }
  }, [locked, needsRevision, revisionPlan, step.kind, selected, checks, text1, text2, sopFields, sopValues, confirmedSlot, reflectValues]);

  function buildPayload(): StepSubmitRequest {
    const base: StepSubmitRequest = { stepId: step.key };
    if (needsRevision) base.revisionPlan = revisionPlan.trim();
    switch (step.kind) {
      case "learn": return { ...base, submittedText1: selected ?? "" };
      case "tour": return { ...base, checklistChecks: checks, submittedText1: text1.trim() || undefined };
      case "sim": return { ...base, submittedText1: text1.trim(), submittedText2: text2.trim(), submittedLink: link.trim() || undefined, checklistChecks: checks };
      case "branch": return { ...base, submittedText1: text1.trim(), submittedText2: text2.trim() || undefined, submittedLink: link.trim() || undefined };
      case "sop": return { ...base, submittedText2: JSON.stringify(sopValues) };
      case "meet": return { ...base, submittedText1: text1.trim() };
      case "reflect": return { ...base, submittedText2: JSON.stringify(reflectValues), submittedLink: link.trim() || undefined };
      default: return base;
    }
  }

  async function handleSubmit() {
    setBusy(true); setErr(null); setFlash(null);
    const res = await onSubmit(buildPayload());
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    if (res.evaluationProposed?.needsRevision) {
      setLocalFeedback(res.evaluationProposed.feedback);
      setFlash(null);
    } else {
      setFlash("Submitted. Nicely done — your work is on its way to review.");
    }
  }

  async function toggleTimer() {
    setErr(null);
    if (step.timerRunning) await onPause(step.key);
    else {
      const ok = await onStart(step.key);
      if (!ok) setErr("Couldn't start the timer. Please try again.");
    }
  }

  const feedback = localFeedback ?? step.feedback;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Breadcrumb + header */}
      <div>
        <button onClick={onBack} className="mc-nav-item" style={{ width: "auto", padding: "4px 8px", marginLeft: -8, color: "var(--mc-ink-2)", fontSize: 13 }}>
          <Icon path="M15 18l-6-6 6-6" size={15} /> Missions
        </button>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 30, lineHeight: 1 }}>{meta.icon}</div>
            <div>
              <span className="mc-kindtag">{step.kindLabel}</span>
              <h1 className="mc-display" style={{ fontSize: 23, fontWeight: 800, margin: "1px 0 0" }}>{step.title}</h1>
            </div>
          </div>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 12 }}>
          <span className="mc-chip">{step.clientName}</span>
          <span className="mc-chip">~{step.estMinutes} min</span>
          <span className="mc-chip">Due Day {step.dayDue}{step.dayDue < currentDay && step.status !== "APPROVED" ? " · overdue" : ""}</span>
        </div>
      </div>

      <div className="mc-grid-detail">
        {/* Left — brief + inputs */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {feedback && <FeedbackCard feedback={feedback} />}

          <Card className="mc-card-pad">
            <h3 className="mc-section-title">The story</h3>
            <p style={{ fontSize: 15, lineHeight: 1.65, margin: "0 0 16px", color: "var(--mc-ink)" }}>{step.story}</p>
            <h3 className="mc-section-title">Your brief</h3>
            <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, color: "var(--mc-ink-2)" }}>{step.instructionsText}</p>
          </Card>

          {/* Per-kind brief body + submission inputs */}
          <Card className="mc-card-pad">
            {renderKindBody()}
          </Card>

          {needsRevision && (
            <Card className="mc-card-pad" style={{ borderColor: "var(--mc-warn-border)" }}>
              <label className="mc-label" htmlFor="mc-rev">Revision plan &amp; ETA <span style={{ color: "#a01a1a" }}>· required</span></label>
              <p style={{ fontSize: 12.5, color: "var(--mc-ink-2)", margin: "0 0 8px" }}>
                Before you resubmit, tell the team what you&apos;re changing and when it&apos;ll be ready.
              </p>
              <textarea id="mc-rev" className="mc-textarea" value={revisionPlan} onChange={(e) => setRevisionPlan(e.target.value)}
                placeholder="e.g. I'll confirm the date with the client, mark it [TBC] in the draft, and resubmit within 2 hours." />
            </Card>
          )}

          {err && <div style={{ background: "#fde8e8", color: "#a01a1a", borderRadius: 12, padding: "10px 12px", fontSize: 13.5 }}>{err}</div>}
          {flash && <div style={{ background: "var(--mc-success-bg)", color: "var(--mc-success-dark)", borderRadius: 12, padding: "10px 12px", fontSize: 13.5, fontWeight: 600 }}>{flash}</div>}

          {!locked && (
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="mc-btn mc-btn-primary" disabled={!canSubmit || busy} onClick={handleSubmit}>
                {busy ? "Submitting…" : needsRevision ? "Resubmit revision" : "Submit for review"}
              </button>
              <button className="mc-btn mc-btn-ghost" onClick={onReportBlocker}>Report a blocker</button>
              {!canSubmit && <span style={{ fontSize: 12.5, color: "var(--mc-ink-3)" }}>{submitHint()}</span>}
            </div>
          )}
          {locked && (
            <div style={{ background: "#eef2ff", color: "var(--mc-navy)", borderRadius: 12, padding: "12px 14px", fontSize: 13.5 }}>
              {step.status === "APPROVED"
                ? "✓ This step is approved. Nothing more to do here."
                : "This step is submitted and awaiting review. We'll let you know if anything needs another look."}
            </div>
          )}
        </div>

        {/* Right — timer + instructions */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card className="mc-card-pad" style={{ textAlign: "center" }}>
            <h3 className="mc-section-title">Step timer</h3>
            <div className="mc-display" style={{ fontFamily: "var(--font-mono)", fontSize: 34, fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--mc-navy)", margin: "4px 0 12px" }}>
              {fmtClock(step.secondsSpent + (step.timerRunning ? liveSeconds : 0))}
            </div>
            {!locked ? (
              <button className={`mc-btn ${step.timerRunning ? "mc-btn-ghost" : "mc-btn-sky"}`} style={{ width: "100%" }} onClick={toggleTimer}>
                {step.timerRunning
                  ? <><Icon path="M9 5v14M15 5v14" size={15} /> Pause timer</>
                  : <><Icon path="M6 4l14 8-14 8V4Z" size={15} /> {step.secondsSpent > 0 ? "Resume timer" : "Start timer"}</>}
              </button>
            ) : (
              <div style={{ fontSize: 13, color: "var(--mc-ink-3)" }}>Time logged: {Math.round(step.secondsSpent / 60)} min</div>
            )}
            <p style={{ fontSize: 12, color: "var(--mc-ink-3)", margin: "10px 0 0", lineHeight: 1.5 }}>
              We only ever count active time. Pause whenever you step away.
            </p>
          </Card>

          <Card className="mc-card-pad">
            <h3 className="mc-section-title">What to deliver</h3>
            <p style={{ fontSize: 13.5, lineHeight: 1.6, margin: 0, color: "var(--mc-ink-2)" }}>{step.deliverableText}</p>
          </Card>
        </div>
      </div>
    </div>
  );

  // ── Per-kind brief + inputs ────────────────────────────────────────────
  function renderKindBody() {
    switch (step.kind) {
      case "learn": return renderLearn();
      case "tour": return renderChecklist("Console practice checklist");
      case "sim": return renderSim();
      case "branch": return renderBranch();
      case "sop": return renderSop();
      case "meet": return renderMeet();
      case "reflect": return renderReflect();
      default: return <p style={{ margin: 0, color: "var(--mc-ink-2)" }}>{step.deliverableText}</p>;
    }
  }

  function renderLearn() {
    if (!scenario) return <p style={{ margin: 0 }}>{step.deliverableText}</p>;
    return (
      <div>
        <h3 className="mc-section-title">Scenario check</h3>
        <p style={{ fontSize: 15, fontWeight: 600, lineHeight: 1.55, margin: "0 0 14px" }}>{scenario.question}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {scenario.options.map((o) => {
            const isSel = selected === o.id;
            return (
              <label key={o.id} style={{
                display: "flex", gap: 11, alignItems: "flex-start", padding: "12px 14px", cursor: locked ? "default" : "pointer",
                border: `1px solid ${isSel ? "var(--mc-navy)" : "var(--mc-border)"}`, borderRadius: 14,
                background: isSel ? "rgba(13,29,95,.04)" : "transparent",
              }}>
                <input type="radio" name="mc-scenario" disabled={locked} checked={isSel} onChange={() => { setSelected(o.id); setFlash(null); }}
                  style={{ marginTop: 2, accentColor: "#0d1d5f", width: 16, height: 16 }} />
                <span style={{ fontSize: 14, lineHeight: 1.5 }}><strong style={{ marginRight: 6 }}>{o.id}.</strong>{o.text}</span>
              </label>
            );
          })}
        </div>
        {chosen && (
          <div style={{
            marginTop: 14, padding: "12px 14px", borderRadius: 14, fontSize: 13.5, lineHeight: 1.55,
            background: chosen.correct ? "var(--mc-success-bg)" : "var(--mc-warn-bg)",
            color: chosen.correct ? "var(--mc-success-dark)" : "var(--mc-warn-ink)",
            border: `1px solid ${chosen.correct ? "#bfe9d1" : "var(--mc-warn-border)"}`,
          }}>
            <strong>{chosen.correct ? "That's the PWA move. " : "Worth a rethink. "}</strong>
            {chosen.correct ? scenario.feedbackCorrect : scenario.feedbackIncorrect}
          </div>
        )}
      </div>
    );
  }

  function renderChecklist(title: string) {
    const items = checklistOf(step);
    return (
      <div>
        <h3 className="mc-section-title">{title}</h3>
        <p style={{ fontSize: 13.5, color: "var(--mc-ink-2)", margin: "0 0 12px" }}>Work through each in the sandbox, then check it off.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {items.map((it, i) => (
            <label key={i} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, cursor: locked ? "default" : "pointer" }}>
              <input type="checkbox" disabled={locked} checked={checks[i] ?? false} style={{ accentColor: "#0d1d5f", width: 16, height: 16 }}
                onChange={(e) => setChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))} />
              {it}
            </label>
          ))}
        </div>
      </div>
    );
  }

  function renderSim() {
    const brief = clientBriefOf(step);
    const items = checklistOf(step);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {brief && (
          <div>
            <h3 className="mc-section-title">Client request · {step.clientName}</h3>
            <blockquote style={{
              margin: 0, padding: "14px 16px", borderRadius: 14, borderLeft: "4px solid var(--mc-sky)",
              background: "#f0fbff", fontSize: 14.5, lineHeight: 1.6, color: "var(--mc-ink)", fontStyle: "italic",
            }}>“{brief}”</blockquote>
          </div>
        )}
        {items.length > 0 && (
          <div>
            <h3 className="mc-section-title">Before you ship, confirm</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {items.map((it, i) => (
                <label key={i} style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 13.5, cursor: locked ? "default" : "pointer" }}>
                  <input type="checkbox" disabled={locked} checked={checks[i] ?? false} style={{ marginTop: 2, accentColor: "#0d1d5f", width: 16, height: 16 }}
                    onChange={(e) => setChecks((c) => c.map((v, j) => (j === i ? e.target.checked : v)))} />
                  {it}
                </label>
              ))}
            </div>
          </div>
        )}
        <Field label="Your message to the client" hint="Ask anything you need confirmed before publishing.">
          <textarea className="mc-textarea" disabled={locked} value={text1} onChange={(e) => setText1(e.target.value)}
            placeholder="Hi Pastor — before I send this out, could you confirm…" />
        </Field>
        <Field label="Announcement draft" hint="Mark anything unconfirmed as a placeholder, e.g. [DATE TBC].">
          <textarea className="mc-textarea" disabled={locked} value={text2} onChange={(e) => setText2(e.target.value)} style={{ minHeight: 130 }}
            placeholder="Join us for Community Impact Day…" />
        </Field>
        <Field label="Evidence link (optional)">
          <input className="mc-input" disabled={locked} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Google Doc or Loom link" />
        </Field>
      </div>
    );
  }

  function renderBranch() {
    const tracks = tracksOf(step);
    const active = specializationTrack && tracks ? tracks[specializationTrack] : null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h3 className="mc-section-title">Your track</h3>
          {active ? (
            <div style={{ padding: "14px 16px", borderRadius: 14, background: "#eef2ff", border: "1px solid #dbe2ff" }}>
              <div style={{ fontWeight: 700, color: "var(--mc-navy)", marginBottom: 4 }}>{active.label}</div>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6, color: "var(--mc-ink-2)" }}>{active.brief}</p>
            </div>
          ) : (
            <p style={{ fontSize: 14, color: "var(--mc-ink-2)", margin: 0 }}>
              Your specialization track will be assigned by your recruiter. Check back once it&apos;s set, or ask Emily.
            </p>
          )}
        </div>
        <Field label="Walkthrough — talk us through your approach" hint="What did you do, and why? What did you assume or flag?">
          <textarea className="mc-textarea" disabled={locked} value={text1} onChange={(e) => setText1(e.target.value)} style={{ minHeight: 120 }}
            placeholder="I started by cross-checking the dates across all five blurbs…" />
        </Field>
        <Field label="Deliverable link" hint="Google Doc, sheet, or Loom — set sharing to 'Anyone with the link'.">
          <input className="mc-input" disabled={locked} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </Field>
        <Field label="Client approval note (optional)">
          <textarea className="mc-textarea" disabled={locked} value={text2} onChange={(e) => setText2(e.target.value)} placeholder="Hi — here's the draft for your approval…" />
        </Field>
      </div>
    );
  }

  function renderSop() {
    const fields = sopFieldsOf(step);
    return (
      <div>
        <h3 className="mc-section-title">Document the process</h3>
        <p style={{ fontSize: 13.5, color: "var(--mc-ink-2)", margin: "0 0 14px" }}>
          Write it so anyone could run it Thursday — and spot one improvement nobody asked for.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {fields.map((f) => (
            <Field key={f} label={f}>
              <textarea className="mc-textarea" disabled={locked} value={sopValues[f] ?? ""} style={{ minHeight: f === "Numbered Steps" ? 130 : 80 }}
                onChange={(e) => setSopValues((v) => ({ ...v, [f]: e.target.value }))}
                placeholder={f === "Improvement Opportunity" ? "One thing that would make this faster or safer…" : ""} />
            </Field>
          ))}
        </div>
      </div>
    );
  }

  function renderMeet() {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <h3 className="mc-section-title">Day-5 team standup</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, margin: "0 0 12px", color: "var(--mc-ink-2)" }}>
            Fifteen minutes with the team. Confirm you&apos;ll attend, or reschedule responsibly — both build trust.
          </p>
          <button
            type="button"
            className="mc-btn"
            disabled={locked}
            onClick={() => setConfirmedSlot((c) => !c)}
            style={confirmedSlot
              ? { background: "var(--mc-success-bg)", color: "var(--mc-success-dark)", border: "1px solid #bfe9d1" }
              : { background: "var(--mc-surface)", color: "var(--mc-ink)", border: "1px solid var(--mc-border)" }}
          >
            {confirmedSlot ? "✓ Standup slot confirmed" : "Confirm my standup slot"}
          </button>
        </div>
        <Field label="Come prepared: Done / Next / Blocked" hint="A concise update you'll bring to the standup.">
          <textarea className="mc-textarea" disabled={locked} value={text1} onChange={(e) => setText1(e.target.value)} style={{ minHeight: 110 }}
            placeholder={"Done: …\nNext: …\nBlocked: …"} />
        </Field>
      </div>
    );
  }

  function renderReflect() {
    const qs = questionsOf(step);
    return (
      <div>
        <h3 className="mc-section-title">Walkthrough &amp; reflection</h3>
        <p style={{ fontSize: 13.5, color: "var(--mc-ink-2)", margin: "0 0 14px" }}>
          Reference concrete moments from your week. Honest and specific beats polished.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {qs.map((q, i) => (
            <Field key={i} label={`${i + 1}. ${q}`}>
              <textarea className="mc-textarea" disabled={locked} value={reflectValues[i] ?? ""}
                onChange={(e) => setReflectValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))} />
            </Field>
          ))}
        </div>
        <Field label="Prefer to record it? Paste a Loom link (optional)">
          <input className="mc-input" disabled={locked} value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://loom.com/…" />
        </Field>
      </div>
    );
  }

  function submitHint(): string {
    if (needsRevision && revisionPlan.trim().length < 4) return "Add your revision plan to resubmit";
    switch (step.kind) {
      case "learn": return "Choose an answer to submit";
      case "tour": return "Check off each step to submit";
      case "sim": return "Add your message and draft to submit";
      case "branch": return "Add your walkthrough to submit";
      case "sop": return "Fill in every field to submit";
      case "meet": return "Confirm your slot and add your update";
      case "reflect": return "Answer all three questions to submit";
      default: return "Complete the step to submit";
    }
  }
}

// ── Small helpers ────────────────────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mc-label" style={{ marginBottom: hint ? 2 : 6 }}>{label}</label>
      {hint && <p style={{ fontSize: 12, color: "var(--mc-ink-3)", margin: "0 0 6px" }}>{hint}</p>}
      {children}
    </div>
  );
}

function FeedbackCard({ feedback }: { feedback: TrialFeedback }) {
  const rows: [string, string][] = [
    ["Observation", feedback.obs],
    ["Impact", feedback.impact],
    ["Suggestion", feedback.sugg],
    ["Encouragement", feedback.enc],
  ];
  return (
    <Card className="mc-card-pad" style={{ background: "var(--mc-warn-bg)", borderColor: "var(--mc-warn-border)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 18 }}>💛</span>
        <h3 className="mc-display" style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "var(--mc-warn-ink)" }}>A note before you resubmit</h3>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {rows.map(([k, v]) => v && (
          <div key={k}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--mc-warn-ink)", opacity: 0.75 }}>{k}</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: "#5a4200" }}>{v}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// Seed a field-keyed record from a prior JSON submission (SOP).
function seedJson(raw: string | null, fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  let parsed: Record<string, unknown> = {};
  if (raw) { try { parsed = JSON.parse(raw); } catch { /* not JSON */ } }
  for (const f of fields) out[f] = typeof parsed[f] === "string" ? (parsed[f] as string) : "";
  return out;
}

// Seed a positional array from a prior JSON submission (reflection).
function seedArray(raw: string | null, len: number): string[] {
  let arr: unknown = [];
  if (raw) { try { arr = JSON.parse(raw); } catch { /* not JSON */ } }
  const src = Array.isArray(arr) ? arr : [];
  return Array.from({ length: len }, (_, i) => (typeof src[i] === "string" ? (src[i] as string) : ""));
}
