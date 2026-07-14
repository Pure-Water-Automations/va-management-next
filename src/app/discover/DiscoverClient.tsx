"use client";

import { useMemo, useState, useRef, useEffect, type CSSProperties, type KeyboardEvent } from "react";
import {
  DISCOVERY_QUESTIONS,
  isVisible,
  estimateAdminCost,
  fitVerdict,
  type DiscoveryQuestion,
} from "@/lib/discovery-questions";
import { BookingPicker } from "./BookingPicker";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Props = {
  adminCostRate: number;
  bookingUrl: string | null;
  testimonial: string | null;
};

export function DiscoverClient({ adminCostRate, bookingUrl, testimonial }: Props) {
  const questions = DISCOVERY_QUESTIONS as DiscoveryQuestion[];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [showCost, setShowCost] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [bookingToken, setBookingToken] = useState<string | null>(null);
  const [bookedLabel, setBookedLabel] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const visible = useMemo(() => questions.filter((q) => isVisible(q, answers)), [questions, answers]);
  const clamped = Math.min(idx, Math.max(0, visible.length - 1));
  const q = visible[clamped];
  const total = visible.length;
  const pct = Math.round(((clamped + (done ? 1 : 0)) / total) * 100);

  useEffect(() => {
    if (q && ["short_text", "email", "long_text"].includes(q.type)) inputRef.current?.focus();
  }, [clamped, q?.key]);

  function set(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setError("");
  }

  function fieldError(question: DiscoveryQuestion, answersNow: Record<string, string>): string | null {
    const v = (answersNow[question.key] ?? "").trim();
    if (!v) return question.required ? "This one's required." : null;
    if (question.type === "email" && !EMAIL_RE.test(v)) return "That doesn't look like a valid email.";
    return null;
  }

  function advance(answersNow: Record<string, string>, keyNow: string) {
    const cur = questions.find((x) => x.key === keyNow);
    if (cur) {
      const err = fieldError(cur, answersNow);
      if (err) { setError(err); return; }
    }
    setError("");
    // Cost-of-inaction interstitial fires right after the hours question.
    if (keyNow === "hoursPerWeek" && !showCost && estimateAdminCost(answersNow.hoursPerWeek ?? "", adminCostRate) > 0) {
      setShowCost(true);
      return;
    }
    const vis = questions.filter((x) => isVisible(x, answersNow));
    const pos = vis.findIndex((x) => x.key === keyNow);
    if (pos < 0) return;
    if (pos >= vis.length - 1) { void submit(answersNow); return; }
    setIdx(pos + 1);
  }

  function next() { if (q) advance(answers, q.key); }
  function back() { setError(""); if (showCost) { setShowCost(false); return; } if (clamped > 0) setIdx(clamped - 1); }

  function choose(value: string) {
    if (!q) return;
    const na = { ...answers, [q.key]: value };
    setAnswers(na);
    setError("");
    window.setTimeout(() => advance(na, q.key), 140);
  }

  function continueFromCost() {
    setShowCost(false);
    const vis = questions.filter((x) => isVisible(x, answers));
    const pos = vis.findIndex((x) => x.key === "hoursPerWeek");
    if (pos >= 0 && pos < vis.length - 1) setIdx(pos + 1);
    else void submit(answers);
  }

  async function submit(answersNow: Record<string, string> = answers) {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/discover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answersNow),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network error — please try again." }));
    setSubmitting(false);
    if (!res.ok) { setError(res.error || "Something went wrong. Please try again."); return; }
    setBookingToken(res.result?.bookingToken ?? null);
    setDone(true);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !(e.shiftKey && q?.type === "long_text")) {
      e.preventDefault();
      next();
    }
  }

  if (done) {
    // Already-booked confirmation.
    if (bookedLabel) {
      return (
        <div style={page}>
          <div style={{ ...card, textAlign: "center", alignItems: "center" }}>
            <div style={{ fontSize: 44 }}>✅</div>
            <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", color: "var(--color-navy-900)", margin: "8px 0 0" }}>
              You&apos;re booked!
            </h1>
            <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-lg)", maxWidth: 460 }}>
              Your discovery call is set for <strong>{bookedLabel}</strong>. A calendar invite is on its way to your email.
            </p>
            <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-md)" }}>
              No re-explaining — we&apos;ll review your answers first. See you then!
            </p>
            {testimonial && <blockquote style={quote}>{testimonial}</blockquote>}
          </div>
        </div>
      );
    }
    // Soften the affirmation for lower-fit answers (no budget / just exploring) so
    // the copy never over-promises — same heuristic the server scores with.
    const strongFit = fitVerdict(answers) !== "cold";
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: "center", alignItems: "center" }}>
          <div style={{ fontSize: 44 }}>🌊</div>
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", color: "var(--color-navy-900)", margin: "8px 0 0" }}>
            {strongFit ? "You’re a strong fit — let’s make this call count." : "Thanks — let’s find the right next step."}
          </h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-lg)", maxWidth: 460 }}>
            Pick a time for your free 30-minute discovery call and we&apos;ll review
            your answers beforehand — no re-explaining, no pitch.
          </p>
          {bookingToken ? (
            <BookingPicker token={bookingToken} fallbackUrl={bookingUrl} onBooked={(label) => setBookedLabel(label || "your selected time")} />
          ) : (
            <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-md)" }}>
              We&apos;ll email you shortly to schedule your call.
            </p>
          )}
          {testimonial && <blockquote style={quote}>{testimonial}</blockquote>}
        </div>
      </div>
    );
  }

  if (showCost) {
    const cost = estimateAdminCost(answers.hoursPerWeek ?? "", adminCostRate);
    return (
      <div style={page}>
        <div style={progressTrack}><div style={{ ...progressBar, width: `${pct}%` }} /></div>
        <div style={{ ...card, textAlign: "center", alignItems: "center" }}>
          <div style={qNum}>Here&apos;s what that&apos;s costing</div>
          <div style={{ fontFamily: "var(--font-display)", fontSize: 56, fontWeight: 800, color: "var(--color-navy-900)", lineHeight: 1 }}>
            ${cost.toLocaleString()}
          </div>
          <div style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-lg)", maxWidth: 420 }}>
            an estimate of the yearly cost of those admin hours at a typical rate — time that could go back to your mission.
          </div>
          <button onClick={continueFromCost} style={{ ...okBtn, marginTop: 18 }}>Keep going →</button>
          <button onClick={back} style={{ ...linkBtn }}>Back</button>
        </div>
      </div>
    );
  }

  if (!q) return <div style={page} />;
  const isChoice = q.type === "single_select";

  return (
    <div style={page}>
      <div style={progressTrack}><div style={{ ...progressBar, width: `${pct}%` }} /></div>
      <div style={card}>
        <div style={qNum}>{clamped + 1} <span style={{ opacity: 0.5 }}>of {total}</span></div>
        <label htmlFor={q.key} style={qLabel}>{q.label}{q.required && <span style={{ color: "var(--color-sky-500)" }}> *</span>}</label>
        {q.help && <div style={qHelp}>{q.help}</div>}
        <div style={{ marginTop: 18 }}>
          <Field q={q} value={answers[q.key] ?? ""} onChange={(v) => set(q.key, v)} onChoose={choose} onKey={onKey} inputRef={inputRef} />
        </div>
        {error && <div style={errStyle}>{error}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
          {!isChoice && (
            <button onClick={next} disabled={submitting} style={okBtn}>
              {submitting ? "Submitting…" : clamped >= total - 1 ? "See my results" : "OK"}
            </button>
          )}
          {!isChoice && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>press <strong>Enter ↵</strong></span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button onClick={back} disabled={clamped === 0} style={navBtn(clamped === 0)} aria-label="Back">↑</button>
            <button onClick={next} disabled={submitting} style={navBtn(false)} aria-label="Next">↓</button>
          </div>
        </div>
      </div>
      <div style={brand}>Pure Water Automations · Refreshing leaders. Removing burdens.</div>
    </div>
  );
}

function Field({
  q, value, onChange, onChoose, onKey, inputRef,
}: {
  q: DiscoveryQuestion;
  value: string;
  onChange: (v: string) => void;
  onChoose: (v: string) => void;
  onKey: (e: KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  if (q.type === "single_select" && q.options) {
    return (
      <div style={{ display: "grid", gap: 10 }}>
        {q.options.map((opt) => (
          <button key={opt} onClick={() => onChoose(opt)} style={{ ...choiceBtn, ...(value === opt ? choiceActive : {}), justifyContent: "flex-start" }}>{opt}</button>
        ))}
      </div>
    );
  }
  if (q.type === "multi_select") {
    return <MultiSelect options={q.options ?? []} allowOther={q.allowOther} value={value} onChange={onChange} onKey={onKey} inputRef={inputRef} />;
  }
  if (q.type === "dropdown") {
    return (
      <select id={q.key} value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
        <option value="">Select…</option>
        {(q.options ?? []).map((o) => (<option key={o} value={o}>{o}</option>))}
      </select>
    );
  }
  if (q.type === "long_text") {
    return (
      <textarea
        id={q.key}
        ref={inputRef as React.RefObject<HTMLTextAreaElement>}
        value={value}
        placeholder={q.placeholder ?? "Type your answer… (Shift+Enter for a new line)"}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKey}
        style={{ ...inputBase, minHeight: 110, resize: "vertical" }}
      />
    );
  }
  return (
    <input
      id={q.key}
      ref={inputRef as React.RefObject<HTMLInputElement>}
      type={q.type === "email" ? "email" : "text"}
      value={value}
      placeholder={q.placeholder ?? "Type your answer…"}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKey}
      style={inputBase}
    />
  );
}

function MultiSelect({
  options, allowOther, value, onChange, onKey, inputRef,
}: {
  options: string[];
  allowOther?: boolean;
  value: string;
  onChange: (v: string) => void;
  onKey: (e: KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  const parts = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const selected = parts.filter((p) => options.includes(p));
  const other = parts.filter((p) => !options.includes(p)).join(", ");
  const [otherOn, setOtherOn] = useState(Boolean(other));

  function rebuild(sel: string[], oth: string) {
    const all = [...sel, ...(oth.trim() ? [oth.trim()] : [])];
    onChange(all.join(", "));
  }
  function toggle(opt: string) {
    const sel = selected.includes(opt) ? selected.filter((s) => s !== opt) : [...selected, opt];
    rebuild(sel, other);
  }
  function toggleOther() {
    setOtherOn((v) => {
      const next = !v;
      if (!next) rebuild(selected, ""); // hiding "Other" drops its free-text value
      return next;
    });
  }

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
        {options.map((opt) => {
          const on = selected.includes(opt);
          return (
            <button key={opt} onClick={() => toggle(opt)} style={{ ...checkBtn, ...(on ? choiceActive : {}), fontWeight: on ? 700 : 400 }}>
              <span style={{ marginRight: 8 }}>{on ? "☑" : "☐"}</span>{opt}
            </button>
          );
        })}
        {allowOther && (
          <button onClick={toggleOther} style={{ ...checkBtn, ...(otherOn ? choiceActive : {}), fontWeight: otherOn ? 700 : 400 }}>
            <span style={{ marginRight: 8 }}>{otherOn ? "☑" : "☐"}</span>Other…
          </button>
        )}
      </div>
      {allowOther && otherOn && (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={other}
          placeholder="Tell us what else (comma-separated)"
          onChange={(e) => rebuild(selected, e.target.value)}
          onKeyDown={onKey}
          style={{ ...inputBase, marginTop: 12, fontSize: "var(--text-lg)" }}
        />
      )}
    </div>
  );
}

const page: CSSProperties = { minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20, background: "linear-gradient(180deg, var(--color-sky-50), var(--color-bg-secondary))" };
const progressTrack: CSSProperties = { position: "fixed", top: 0, left: 0, right: 0, height: 6, background: "var(--color-bg-tertiary)" };
const progressBar: CSSProperties = { height: "100%", background: "linear-gradient(90deg, var(--color-sky-400), var(--color-navy-700))", transition: "width 0.3s ease" };
const card: CSSProperties = { width: "100%", maxWidth: 640, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-lg)", padding: "36px 40px", display: "flex", flexDirection: "column" };
const qNum: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--color-sky-600)", fontWeight: 700, marginBottom: 8 };
const qLabel: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", color: "var(--color-navy-900)", lineHeight: 1.25, fontWeight: 700 };
const qHelp: CSSProperties = { marginTop: 8, color: "var(--color-text-secondary)", fontSize: "var(--text-md)" };
const selectStyle: CSSProperties = { width: "100%", border: "1.5px solid var(--color-sky-300)", borderRadius: "var(--radius-input)", padding: "12px 14px", font: "inherit", fontSize: "var(--text-lg)", color: "var(--color-navy-900)", background: "var(--color-surface)", outline: "none" };
const inputBase: CSSProperties = { width: "100%", border: "none", borderBottom: "2px solid var(--color-sky-300)", background: "transparent", padding: "8px 2px", font: "inherit", fontSize: "var(--text-xl)", color: "var(--color-navy-900)", outline: "none" };
const okBtn: CSSProperties = { border: "none", borderRadius: 9999, padding: "12px 26px", background: "var(--color-navy-900, #132272)", color: "#fff", fontWeight: 700, fontSize: "var(--text-md)", cursor: "pointer" };
const linkBtn: CSSProperties = { border: "none", background: "transparent", color: "var(--color-text-tertiary)", fontSize: "var(--text-sm)", cursor: "pointer", marginTop: 10 };
const choiceBtn: CSSProperties = { flex: 1, border: "1.5px solid var(--color-border)", borderRadius: 12, padding: "16px 18px", background: "var(--color-surface)", cursor: "pointer", fontSize: "var(--text-lg)", color: "var(--color-navy-900)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s ease" };
const checkBtn: CSSProperties = { border: "1.5px solid var(--color-border)", borderRadius: 10, padding: "11px 14px", background: "var(--color-surface)", cursor: "pointer", fontSize: "var(--text-md)", color: "var(--color-navy-900)", display: "flex", alignItems: "center", textAlign: "left", transition: "all 0.15s ease" };
const choiceActive: CSSProperties = { borderColor: "var(--color-navy-700, #132272)", background: "var(--color-sky-50)", boxShadow: "0 0 0 3px var(--color-sky-100)" };
const errStyle: CSSProperties = { marginTop: 12, color: "var(--color-error, #b42318)", fontSize: "var(--text-sm)", fontWeight: 600 };
const brand: CSSProperties = { marginTop: 20, fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", letterSpacing: "0.04em" };
const quote: CSSProperties = { marginTop: 20, fontStyle: "italic", color: "var(--color-text-secondary)", fontSize: "var(--text-md)", maxWidth: 440, borderLeft: "3px solid var(--color-sky-300)", paddingLeft: 14, textAlign: "left" };
function navBtn(disabled: boolean): CSSProperties {
  return { width: 38, height: 38, borderRadius: 8, border: "1px solid var(--color-border)", background: disabled ? "var(--color-bg-tertiary)" : "var(--color-navy-900, #132272)", color: disabled ? "var(--color-text-tertiary)" : "#fff", cursor: disabled ? "default" : "pointer", fontSize: 16, fontWeight: 700 };
}
