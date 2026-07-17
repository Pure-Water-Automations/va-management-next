"use client";

import { useMemo, useState, useRef, useEffect, type CSSProperties, type KeyboardEvent } from "react";
import { APPLICATION_QUESTIONS, isVisible, type ApplicationQuestion } from "@/lib/application-questions";
import { useDraft } from "@/lib/use-draft";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Draft = { answers: Record<string, string>; idx: number };

/** Tiny local media-query hook — not a breakpoint system, just this screen's one narrow check. */
function useIsNarrow(query: string): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia(query);
    setNarrow(mq.matches);
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return narrow;
}

export function ApplyClient({ skillOptions }: { skillOptions?: string[] }) {
  // Inject runtime skill options (from the skill_list setting) into the skills question.
  const questions = useMemo<ApplicationQuestion[]>(
    () =>
      APPLICATION_QUESTIONS.map((q) =>
        q.key === "skills" && skillOptions?.length ? { ...q, options: skillOptions } : q,
      ),
    [skillOptions],
  );

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);
  const isNarrow = useIsNarrow("(max-width: 480px)");

  const draft = useDraft<Draft>("pwa_apply_draft", { answers, idx }, (saved) => {
    setAnswers(saved.answers);
    setIdx(saved.idx);
  });

  const visible = useMemo(() => questions.filter((q) => isVisible(q, answers)), [questions, answers]);
  const clamped = Math.min(idx, Math.max(0, visible.length - 1));
  const q = visible[clamped];
  const total = visible.length;
  const pct = Math.round(((clamped + (done ? 1 : 0)) / total) * 100);

  useEffect(() => {
    if (q && ["short_text", "email", "url", "long_text"].includes(q.type)) inputRef.current?.focus();
  }, [clamped, q?.key]);

  function set(key: string, value: string) {
    setAnswers((a) => ({ ...a, [key]: value }));
    setError("");
  }

  function fieldError(question: ApplicationQuestion, answersNow: Record<string, string>): string | null {
    const v = (answersNow[question.key] ?? "").trim();
    if (!v) return question.required ? "This one's required." : null;
    if (question.type === "email" && !EMAIL_RE.test(v)) return "That doesn't look like a valid email.";
    if (question.type === "url" && !/^https?:\/\//i.test(v)) return "Please paste a full link starting with https://";
    return null;
  }

  /**
   * Advance using an explicit answers snapshot + the key just answered — never
   * stale React state. This is what fixes the spurious "required" flash when a
   * choice button is clicked (the click set the value and advanced in one go).
   */
  function advance(answersNow: Record<string, string>, keyNow: string) {
    const cur = questions.find((x) => x.key === keyNow);
    if (cur) {
      const err = fieldError(cur, answersNow);
      if (err) { setError(err); return; }
    }
    setError("");
    const vis = questions.filter((x) => isVisible(x, answersNow));
    const pos = vis.findIndex((x) => x.key === keyNow);
    if (pos < 0) return;
    if (pos >= vis.length - 1) { void submit(answersNow); return; }
    setIdx(pos + 1);
  }

  function next() { if (q) advance(answers, q.key); }
  function back() { setError(""); if (clamped > 0) setIdx(clamped - 1); }

  // Choice questions: set the value and advance from that exact snapshot.
  function choose(value: string) {
    if (!q) return;
    const na = { ...answers, [q.key]: value };
    setAnswers(na);
    setError("");
    window.setTimeout(() => advance(na, q.key), 140); // brief highlight, then move on
  }

  async function submit(answersNow: Record<string, string> = answers) {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/apply", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(answersNow),
    }).then((r) => r.json()).catch(() => ({ ok: false, error: "Network error — please try again." }));
    setSubmitting(false);
    if (!res.ok) { setError(res.error || "Something went wrong. Please try again."); return; }
    draft.discard();
    setDone(true);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === "Enter" && !(e.shiftKey && q?.type === "long_text")) {
      e.preventDefault();
      next();
    }
  }

  if (done) {
    return (
      <div style={page}>
        <div style={{ ...card, textAlign: "center", alignItems: "center" }}>
          <img src="/purii/waving.png" alt="" style={{ height: 96, objectFit: "contain" }} />
          <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-3xl)", color: "var(--color-navy-900)", margin: "8px 0 0" }}>Thank you!</h1>
          <p style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-lg)", maxWidth: 440 }}>
            Your application is in. Our recruitment team will review it and reach out by email if it&apos;s a fit. Keep an eye on your inbox.
          </p>
        </div>
      </div>
    );
  }
  if (!q) return <div style={page} />;

  const isChoice = q.type === "yes_no" || q.type === "single_select";

  return (
    <div style={page}>
      <div style={progressTrack}><div style={{ ...progressBar, width: `${pct}%` }} /></div>

      {draft.hasDraft && (
        <div style={{ ...resumeBanner, ...(isNarrow ? resumeBannerNarrow : {}) }}>
          <span>Welcome back — resume where you left off? <span style={{ opacity: 0.65 }}>({draft.draftAgeLabel})</span></span>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={draft.resume} style={resumeBtn}>Resume</button>
            <button onClick={draft.discard} style={startOverBtn}>Start over</button>
          </div>
        </div>
      )}

      <div style={{ ...card, ...(isNarrow ? cardNarrow : {}) }}>
        <div style={qNum}>{clamped + 1} <span style={{ opacity: 0.5 }}>of {total}</span></div>
        <label htmlFor={q.key} style={qLabel}>
          {q.label}
          {q.required && <span style={{ color: "var(--color-sky-500)" }}> *</span>}
          {!q.required && <span style={optionalTag}> (optional)</span>}
        </label>
        {q.help && <div style={qHelp}>{q.help}</div>}
        {q.helpLink && (
          <a href={q.helpLink.url} target="_blank" rel="noreferrer" style={helpLinkStyle}>{q.helpLink.label}</a>
        )}
        {q.image && (
          <img src={q.image} alt="World time zones by UTC offset" style={qImage} />
        )}

        <div style={{ marginTop: 18 }}>
          <Field q={q} value={answers[q.key] ?? ""} onChange={(v) => set(q.key, v)} onChoose={choose} onKey={onKey} inputRef={inputRef} />
        </div>

        {error && <div style={errStyle}>{error}</div>}

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22 }}>
          {!isChoice && (
            <button onClick={next} disabled={submitting} style={okBtn}>
              {submitting ? "Submitting…" : clamped >= total - 1 ? "Submit application" : "OK"}
            </button>
          )}
          {!isChoice && <span style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)" }}>press <strong>Enter ↵</strong></span>}
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button onClick={back} disabled={clamped === 0} style={navBtn(clamped === 0)} aria-label="Back">↑</button>
            <button onClick={next} disabled={submitting} style={navBtn(false)} aria-label="Next">↓</button>
          </div>
        </div>
      </div>

      <div style={brand}>Pure Water Automations · Virtual Assistant Application</div>
    </div>
  );
}

function Field({
  q, value, onChange, onChoose, onKey, inputRef,
}: {
  q: ApplicationQuestion;
  value: string;
  onChange: (v: string) => void;
  onChoose: (v: string) => void;
  onKey: (e: KeyboardEvent) => void;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
}) {
  if (q.type === "yes_no") {
    return (
      <div style={{ display: "flex", gap: 12 }}>
        {[["yes", "Yes"], ["no", "No"]].map(([v, label]) => (
          <button key={v} onClick={() => onChoose(v)} style={{ ...choiceBtn, ...(value === v ? choiceActive : {}) }}>
            <span style={{ fontWeight: 700 }}>{label}</span>
          </button>
        ))}
      </div>
    );
  }
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
        {(q.options ?? []).map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
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
      type={q.type === "email" ? "email" : q.type === "url" ? "url" : "text"}
      value={value}
      placeholder={q.placeholder ?? "Type your answer…"}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKey}
      style={inputBase}
    />
  );
}

/** Checkbox grid + an optional free-text "Other". Value is a comma-joined string. */
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
          <button onClick={() => setOtherOn((v) => !v)} style={{ ...checkBtn, ...(otherOn ? choiceActive : {}), fontWeight: otherOn ? 700 : 400 }}>
            <span style={{ marginRight: 8 }}>{otherOn ? "☑" : "☐"}</span>Other…
          </button>
        )}
      </div>
      {allowOther && otherOn && (
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          value={other}
          placeholder="Tell us your other skills (comma-separated)"
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
const cardNarrow: CSSProperties = { padding: "20px 18px" };
const optionalTag: CSSProperties = { fontSize: "var(--text-sm)", fontWeight: 400, color: "var(--color-text-tertiary)" };
const resumeBanner: CSSProperties = { width: "100%", maxWidth: 640, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 14, padding: "12px 16px", background: "var(--color-sky-50)", border: "1px solid var(--color-sky-300)", borderRadius: "var(--radius-lg)", color: "var(--color-navy-900)", fontSize: "var(--text-sm)" };
const resumeBannerNarrow: CSSProperties = { flexDirection: "column", alignItems: "flex-start" };
const resumeBtn: CSSProperties = { border: "none", borderRadius: 8, padding: "8px 14px", minHeight: 46, background: "var(--color-navy-800, #132272)", color: "#fff", fontWeight: 700, fontSize: "var(--text-sm)", cursor: "pointer" };
const startOverBtn: CSSProperties = { border: "1.5px solid var(--color-border)", borderRadius: 8, padding: "8px 14px", minHeight: 46, background: "var(--color-surface)", color: "var(--color-text-secondary)", fontWeight: 600, fontSize: "var(--text-sm)", cursor: "pointer" };
const qNum: CSSProperties = { fontFamily: "var(--font-mono)", fontSize: "var(--text-sm)", color: "var(--color-sky-600)", fontWeight: 700, marginBottom: 8 };
const qLabel: CSSProperties = { fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)", color: "var(--color-navy-900)", lineHeight: 1.25, fontWeight: 700 };
const qHelp: CSSProperties = { marginTop: 8, color: "var(--color-text-secondary)", fontSize: "var(--text-md)" };
const helpLinkStyle: CSSProperties = { display: "inline-block", marginTop: 8, color: "var(--color-sky-600)", fontWeight: 700, fontSize: "var(--text-md)", textDecoration: "none" };
const qImage: CSSProperties = { display: "block", width: "100%", marginTop: 16, borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)" };
const selectStyle: CSSProperties = { width: "100%", border: "1.5px solid var(--color-sky-300)", borderRadius: "var(--radius-input)", padding: "12px 14px", font: "inherit", fontSize: "var(--text-lg)", color: "var(--color-navy-900)", background: "var(--color-surface)", outline: "none" };
const inputBase: CSSProperties = { width: "100%", border: "none", borderBottom: "2px solid var(--color-sky-300)", background: "transparent", padding: "8px 2px", font: "inherit", fontSize: "var(--text-xl)", color: "var(--color-navy-900)", outline: "none" };
const okBtn: CSSProperties = { border: "none", borderRadius: 10, padding: "11px 22px", minHeight: 46, background: "var(--color-navy-800, #132272)", color: "#fff", fontWeight: 700, fontSize: "var(--text-md)", cursor: "pointer" };
const choiceBtn: CSSProperties = { flex: 1, border: "1.5px solid var(--color-border)", borderRadius: 12, padding: "16px 18px", background: "var(--color-surface)", cursor: "pointer", fontSize: "var(--text-lg)", color: "var(--color-navy-900)", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s ease" };
const checkBtn: CSSProperties = { border: "1.5px solid var(--color-border)", borderRadius: 10, padding: "11px 14px", background: "var(--color-surface)", cursor: "pointer", fontSize: "var(--text-md)", color: "var(--color-navy-900)", display: "flex", alignItems: "center", textAlign: "left", transition: "all 0.15s ease" };
const choiceActive: CSSProperties = { borderColor: "var(--color-navy-700, #132272)", background: "var(--color-sky-50)", boxShadow: "0 0 0 3px var(--color-sky-100)" };
const errStyle: CSSProperties = { marginTop: 12, color: "var(--color-error, #b42318)", fontSize: "var(--text-sm)", fontWeight: 600 };
const brand: CSSProperties = { marginTop: 20, fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", letterSpacing: "0.04em" };
function navBtn(disabled: boolean): CSSProperties {
  return { width: 46, minHeight: 46, borderRadius: 8, border: "1px solid var(--color-border)", background: disabled ? "var(--color-bg-tertiary)" : "var(--color-navy-800, #132272)", color: disabled ? "var(--color-text-tertiary)" : "#fff", cursor: disabled ? "default" : "pointer", fontSize: 16, fontWeight: 700 };
}
