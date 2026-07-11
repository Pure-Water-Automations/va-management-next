// Screen 14 — Blocker & escalation modals. Both POST /api/trials/escalate:
// type=blocker (with optional step context) and type=human_help (reaches a real
// person and pauses AI scoring indicators). Shared overlay chrome.

import { useState, type ReactNode } from "react";
import type { EscalateRequest, TrialStepView } from "@/lib/trial/types";
import { api } from "./lib";
import { Icon } from "./ui";

function Overlay({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="mc-root" style={{ position: "fixed", inset: 0 }}>
      <div className="mc-overlay" onClick={onClose}>
        <div className="mc-modal" onClick={(e) => e.stopPropagation()}>{children}</div>
      </div>
    </div>
  );
}

function Header({ emoji, title, subtitle, onClose }: { emoji: string; title: string; subtitle: string; onClose: () => void }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 14 }}>
      <div style={{ fontSize: 26 }}>{emoji}</div>
      <div style={{ flex: 1 }}>
        <h2 className="mc-display" style={{ fontSize: 19, fontWeight: 800, margin: "0 0 2px" }}>{title}</h2>
        <p style={{ fontSize: 13, color: "var(--mc-ink-2)", margin: 0, lineHeight: 1.5 }}>{subtitle}</p>
      </div>
      <button onClick={onClose} aria-label="Close" style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--mc-ink-3)", padding: 4 }}>
        <Icon path="M6 6l12 12M18 6 6 18" size={18} />
      </button>
    </div>
  );
}

function useEscalate(token: string, onClose: () => void) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  async function submit(body: EscalateRequest) {
    setBusy(true); setErr(null);
    const res = await api.escalate(token, body);
    setBusy(false);
    if (res.ok) { setDone(true); window.setTimeout(onClose, 1600); }
    else setErr(res.error);
  }
  return { busy, err, done, submit };
}

export function BlockerModal({ token, steps, defaultStepId, onClose }: {
  token: string; steps: TrialStepView[]; defaultStepId: string | null; onClose: () => void;
}) {
  const [stepId, setStepId] = useState(defaultStepId ?? "");
  const [text, setText] = useState("");
  const { busy, err, done, submit } = useEscalate(token, onClose);

  if (done) return <Overlay onClose={onClose}><Done title="Blocker reported" body="Thanks for the early flag — the team can see it now. Keep moving where you can." /></Overlay>;

  return (
    <Overlay onClose={onClose}>
      <Header emoji="🚧" title="Report a blocker" subtitle="Stuck on something? Flag it early — that's exactly what a reliable teammate does." onClose={onClose} />
      <label className="mc-label">Which step? (optional)</label>
      <select className="mc-input" value={stepId} onChange={(e) => setStepId(e.target.value)} style={{ marginBottom: 12 }}>
        <option value="">Not step-specific</option>
        {steps.map((s) => <option key={s.key} value={s.key}>{s.title}</option>)}
      </select>
      <label className="mc-label">What&apos;s blocking you?</label>
      <textarea className="mc-textarea" value={text} onChange={(e) => setText(e.target.value)}
        placeholder="e.g. The client hasn't confirmed the event date, so I can't finalize the announcement." />
      {err && <p style={{ color: "#a01a1a", fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="mc-btn mc-btn-primary" disabled={text.trim().length < 4 || busy}
          onClick={() => submit({ type: "blocker", messageText: text.trim(), stepId: stepId || undefined })}>
          {busy ? "Sending…" : "Send blocker"}
        </button>
        <button className="mc-btn mc-btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Overlay>
  );
}

export function EscalateModal({ token, onClose }: { token: string; onClose: () => void }) {
  const [text, setText] = useState("");
  const { busy, err, done, submit } = useEscalate(token, onClose);

  if (done) return <Overlay onClose={onClose}><Done title="A person will reach out" body="Your message is with a human on the Pure Water team. AI scoring pauses while they help." /></Overlay>;

  return (
    <Overlay onClose={onClose}>
      <Header emoji="🙋" title="Ask a person" subtitle="Reach a real human on the Pure Water team any time. This never counts against you." onClose={onClose} />
      <div style={{ background: "#eef2ff", borderRadius: 12, padding: "10px 12px", fontSize: 12.5, color: "var(--mc-navy)", marginBottom: 12, lineHeight: 1.5 }}>
        Every hiring decision is made by a human — reaching out for help is a signal of good judgment, not a penalty.
      </div>
      <label className="mc-label">What do you need help with?</label>
      <textarea className="mc-textarea" value={text} onChange={(e) => setText(e.target.value)}
        placeholder="Tell us what's going on and how we can help." />
      {err && <p style={{ color: "#a01a1a", fontSize: 13, margin: "8px 0 0" }}>{err}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button className="mc-btn mc-btn-primary" disabled={text.trim().length < 4 || busy}
          onClick={() => submit({ type: "human_help", messageText: text.trim() })}>
          {busy ? "Sending…" : "Reach a person"}
        </button>
        <button className="mc-btn mc-btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Overlay>
  );
}

function Done({ title, body }: { title: string; body: string }) {
  return (
    <div style={{ textAlign: "center", padding: "8px 4px" }}>
      <div style={{ fontSize: 38, marginBottom: 6 }}>✅</div>
      <h2 className="mc-display" style={{ fontSize: 19, fontWeight: 800, margin: "0 0 6px", color: "var(--mc-success-dark)" }}>{title}</h2>
      <p style={{ fontSize: 14, color: "var(--mc-ink-2)", margin: 0, lineHeight: 1.55 }}>{body}</p>
    </div>
  );
}
