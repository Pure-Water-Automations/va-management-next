"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { sndTalk, sndOpen, sndPowerUp, sndSuccess, sndError, setMuted } from "@/lib/purii-sound";

// ── Lightweight markdown for Purii's bubbles (bold, lists, line breaks) ─────
function parseBold(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith("**") && part.endsWith("**") ? (
      <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}
function renderRich(text: string): ReactNode {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: ReactNode[] = [];
  let key = 0;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { out.push(<div key={key++} style={{ height: 6 }} />); continue; }
    const numbered = line.match(/^(\d+)[.)]\s+(.*)$/);
    const bullet = line.match(/^[-•]\s+(.*)$/);
    if (numbered) {
      out.push(<div key={key++} style={listRow}><span style={numMarker}>{numbered[1]}</span><span>{parseBold(numbered[2])}</span></div>);
    } else if (bullet) {
      out.push(<div key={key++} style={listRow}><span style={{ ...numMarker, background: "var(--color-sky-400)" }}>•</span><span>{parseBold(bullet[1])}</span></div>);
    } else {
      out.push(<div key={key++} style={{ marginBottom: 2 }}>{parseBold(line)}</div>);
    }
  }
  return out;
}
const listRow: CSSProperties = { display: "flex", gap: 8, alignItems: "flex-start", margin: "4px 0" };
const numMarker: CSSProperties = {
  flexShrink: 0, width: 18, height: 18, borderRadius: "50%", marginTop: 1,
  background: "var(--color-navy-800)", color: "#fff", fontSize: 11, fontWeight: 700,
  display: "inline-flex", alignItems: "center", justifyContent: "center",
};

type TourStep = { sprite: string; title: string; body: string; href?: string; cta?: string };
type Proposal = { tool: string; args: Record<string, unknown>; summary: string };
type Msg = { from: "you" | "purii"; text: string };

const SUGGESTIONS = [
  "How do I approve a VA's promotion?",
  "How do I run payroll?",
  "How do I invite a candidate to training?",
  "Where do I see capacity alerts?",
];
const BYPASS_PASSWORD = "permission bypass";
const MATRIX_PASSWORD = "enter the matrix";

const sprite = (name: string) => `/purii/${name}.png`;
const bsprite = (name: string) => `/purii/bypass/${name}.png`;
const msprite = (name: string) => `/purii/matrix/${name}.png`;

export function Purii({ tour, canBypass = false }: { tour: TourStep[]; canBypass?: boolean }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"ask" | "tour">("ask");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [face, setFace] = useState("happy");
  const [step, setStep] = useState(0);
  const [bypass, setBypass] = useState(false);
  const [matrix, setMatrix] = useState(false);
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [muted, setMutedState] = useState(false);
  const [popKey, setPopKey] = useState(0); // bumps to replay the mascot "pop"
  const [notif, setNotif] = useState<{ count: number; items: { key: string; label: string; count: number; href: string }[]; greeting: string } | null>(null);
  const [greeted, setGreeted] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    fetch("/api/purii/notifications").then((r) => r.json()).then((d) => { if (d?.ok) setNotif(d); }).catch(() => {});
  }, []);

  useEffect(() => {
    const m = typeof window !== "undefined" && localStorage.getItem("purii_muted") === "1";
    setMutedState(m); setMuted(m);
  }, []);

  // Keep Permission Bypass mode unlocked across navigations/windows (admins only).
  useEffect(() => {
    if (canBypass && typeof window !== "undefined" && localStorage.getItem("purii_bypass") === "1") {
      setBypass(true); setFace("hero");
    }
  }, [canBypass]);
  // Keep Matrix mode unlocked across navigations/windows (admins only).
  useEffect(() => {
    if (canBypass && typeof window !== "undefined" && localStorage.getItem("purii_matrix") === "1") {
      setMatrix(true); setFace("hero");
    }
  }, [canBypass]);
  function toggleMute() {
    const m = !muted;
    setMutedState(m); setMuted(m);
    if (typeof window !== "undefined") localStorage.setItem("purii_muted", m ? "1" : "0");
  }

  function scrollDown() {
    requestAnimationFrame(() => { if (scroller.current) scroller.current.scrollTop = scroller.current.scrollHeight; });
  }
  const say = (text: string, from: Msg["from"] = "purii") => {
    setMessages((m) => [...m, { from, text }]);
    if (from === "purii") { sndTalk(); setPopKey((k) => k + 1); }
    scrollDown();
  };

  async function send(q: string) {
    const text = q.trim();
    if (!text || loading) return;

    // Password unlock / lock toggles
    if (canBypass && text.toLowerCase() === MATRIX_PASSWORD) {
      setInput(""); setMatrix(true); setBypass(false); setProposal(null); setFace("hero"); sndPowerUp();
      if (typeof window !== "undefined") { localStorage.setItem("purii_matrix", "1"); localStorage.setItem("purii_bypass", "0"); }
      say("🟢 **Matrix mode online.** I can see the code and act on the system — ask me anything or tell me what to change. I'll confirm before any change.");
      return;
    }
    if (canBypass && text.toLowerCase() === BYPASS_PASSWORD) {
      setInput(""); setBypass(true); setMatrix(false); setProposal(null); setFace("hero"); sndPowerUp();
      if (typeof window !== "undefined") { localStorage.setItem("purii_bypass", "1"); localStorage.setItem("purii_matrix", "0"); }
      say("⚡ **Permission Bypass mode engaged.** I can take real actions now — just tell me what to do. I'll confirm before anything changes.");
      return;
    }
    if (matrix && (text.toLowerCase() === "exit" || text.toLowerCase() === "exit matrix")) {
      setInput(""); setMatrix(false); setProposal(null);
      if (typeof window !== "undefined") localStorage.setItem("purii_matrix", "0");
      say("Back to normal mode. 🌊");
      return;
    }
    if (bypass && (text.toLowerCase() === "exit" || text.toLowerCase() === "exit bypass")) {
      setInput(""); setBypass(false); setProposal(null);
      if (typeof window !== "undefined") localStorage.setItem("purii_bypass", "0");
      say("Back to normal mode. 🌊");
      return;
    }

    say(text, "you");
    setInput("");
    setLoading(true);
    setFace(matrix || bypass ? "scan" : "thinking");

    if (matrix || bypass) {
      const path = matrix ? "/api/purii/matrix" : "/api/purii/act";
      const res = await postAction(path, { question: text });
      setLoading(false);
      const r = res.result as { type?: string; text?: string; proposal?: Proposal } | undefined;
      if (!res.ok) { setFace("warning"); sndError(); say(res.error || "That didn't go through."); return; }
      if (r?.type === "proposal" && r.proposal) { setFace("warning"); setProposal(r.proposal); sndTalk(); setPopKey((k) => k + 1); scrollDown(); return; }
      setFace("hero"); say(r?.text || "Standing by.");
      return;
    }

    const res = await postAction("/api/purii/ask", { question: text });
    setLoading(false);
    const r = res.result as { answer?: string; sprite?: string } | undefined;
    setFace(r?.sprite || "pointing");
    say(r?.answer || res.error || "Hmm, try again?");
  }

  async function confirmProposal() {
    if (!proposal || loading) return;
    setLoading(true);
    setFace("charge");
    const res = await postAction("/api/purii/execute", { tool: proposal.tool, args: proposal.args });
    setLoading(false);
    setProposal(null);
    const r = res.result as { message?: string } | undefined;
    if (!res.ok) { setFace("warning"); sndError(); say(res.error || "Action failed."); return; }
    setFace("success"); sndSuccess();
    say(r?.message || "Done. ✅");
    router.refresh();
  }

  const cur = tour[Math.min(step, tour.length - 1)];
  const power = matrix || bypass; // Matrix and Bypass share the "charged" look.
  const mode = matrix ? "matrix" : bypass ? "bypass" : null; // null = normal
  const powerFace = face === "scan" ? "scan" : face === "warning" ? "warning" : face === "success" ? "success" : face === "charge" ? "charge" : "hero";
  const glow = matrix ? "rgba(74,222,128,.85)" : "rgba(125,249,255,.8)"; // green for Matrix, cyan for Bypass

  // Tour spotlight (in-page element, else sidebar item) with render retries.
  useEffect(() => {
    const clear = () => document.querySelectorAll(".purii-highlight").forEach((el) => el.classList.remove("purii-highlight"));
    clear();
    if (!open || tab !== "tour" || !cur.href) return;
    let done = false; const timers: number[] = [];
    const tryHighlight = () => {
      if (done) return;
      const target = (pathname === cur.href && document.querySelector(`[data-tour-el="${cur.href}"]`)) || document.querySelector(`[data-tour="${cur.href}"]`);
      if (target) { done = true; clear(); target.classList.add("purii-highlight"); target.scrollIntoView({ block: "center", behavior: "smooth" }); }
    };
    tryHighlight();
    [120, 400, 900].forEach((ms) => timers.push(window.setTimeout(tryHighlight, ms)));
    return () => { timers.forEach(clearTimeout); clear(); };
  }, [open, tab, step, cur.href, pathname]);

  const headerSprite = matrix ? msprite(powerFace) : bypass ? bsprite(powerFace) : sprite(tab === "tour" ? cur.sprite : face);

  return (
    <>
      <button
        onClick={() => {
          const next = !open; setOpen(next);
          if (next) { sndOpen(); if (!power && notif && notif.count > 0 && !greeted) { setGreeted(true); say(notif.greeting); } }
        }}
        aria-label="Open Purii helper"
        className={power ? "purii-glow" : "purii-float"}
        style={matrix ? fabMatrix : bypass ? fabBypass : fab}
      >
        <img
          src={matrix ? "/purii/matrix/animated.gif" : bypass ? "/purii/bypass/animated.gif" : open ? sprite("smile") : "/purii/animated.gif"}
          alt="Purii"
          style={{ width: power ? 76 : 60, height: power ? 76 : 60, objectFit: "contain", filter: power ? `drop-shadow(0 0 6px ${glow})` : "none" }}
        />
        {!open && !power && notif && notif.count > 0 && <span style={badge}>{notif.count}</span>}
      </button>

      {open && (
        <div className="purii-panel-in" style={matrix ? panelMatrix : bypass ? panelBypass : panel}>
          <div style={matrix ? headerMatrix : bypass ? headerBypass : header}>
            <img
              key={`${popKey}-${headerSprite}`}
              className="purii-pop"
              src={headerSprite}
              alt=""
              style={{ width: power ? 56 : 50, height: power ? 56 : 50, objectFit: "contain", filter: power ? `drop-shadow(0 0 5px ${glow})` : "none" }}
            />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-md)", color: "#fff", lineHeight: 1 }}>
                Purii {matrix ? <span style={{ color: "#4ade80", fontSize: "var(--text-xs)" }}>· MATRIX</span> : bypass ? <span style={{ color: "#7df9ff", fontSize: "var(--text-xs)" }}>· BYPASS</span> : null}
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: power ? (matrix ? "#4ade80" : "#7df9ff") : "rgba(255,255,255,.7)" }}>
                {matrix ? "matrix mode active" : bypass ? "permission bypass active" : "your console guide"}
              </div>
            </div>
            <button onClick={toggleMute} aria-label={muted ? "Unmute" : "Mute"} title={muted ? "Unmute" : "Mute"} style={iconBtn}>{muted ? "🔇" : "🔊"}</button>
            {power && <button onClick={() => { setBypass(false); setMatrix(false); setProposal(null); if (typeof window !== "undefined") { localStorage.setItem("purii_bypass", "0"); localStorage.setItem("purii_matrix", "0"); } say("Back to normal mode. 🌊"); }} aria-label="Exit power mode" style={exitBtn}>exit</button>}
            <button onClick={() => setOpen(false)} aria-label="Close" style={closeBtn}>×</button>
          </div>

          {!power && (
            <div style={tabs}>
              <button onClick={() => setTab("ask")} style={tabBtn(tab === "ask")}>Ask Purii</button>
              <button onClick={() => { setTab("tour"); setStep(0); }} style={tabBtn(tab === "tour")}>Take the tour</button>
            </div>
          )}

          {power || tab === "ask" ? (
            <>
              <div ref={scroller} style={{ ...body, background: power ? "#0b1220" : undefined }}>
                {!power && notif && notif.items.length > 0 && (
                  <div style={notifBlock}>
                    <div style={{ fontWeight: 700, fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: ".12em", color: "var(--color-accent)", marginBottom: 8 }}>📌 Waiting for you</div>
                    {notif.items.map((it) => (
                      <button key={it.key} onClick={() => { setOpen(false); router.push(it.href); }} style={notifItem}>
                        <span style={notifCount}>{it.count}</span>
                        <span>{it.label}</span>
                      </button>
                    ))}
                  </div>
                )}
                {messages.length === 0 && !power && (
                  <div style={{ color: "var(--color-text-secondary)", fontSize: "var(--text-sm)" }}>
                    <p style={{ marginTop: 0 }}>Hi! Ask me how to do anything in the console.</p>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} style={chip}>{s}</button>)}
                    </div>
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: m.from === "you" ? "flex-end" : "flex-start", marginBottom: 8 }}>
                    <div style={bubble(m.from === "you", mode)}>{m.from === "you" ? m.text : renderRich(m.text)}</div>
                  </div>
                ))}
                {loading && <div style={{ ...bubble(false, mode), opacity: 0.7 }}>{power ? "Purii is working…" : "Purii is thinking…"}</div>}
                {proposal && (
                  <div style={proposalCard}>
                    <div style={{ fontWeight: 700, color: "#fff", display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                      <span>⚠️ Confirm action</span>
                    </div>
                    <div style={{ color: "#dbeafe", fontSize: "var(--text-sm)", lineHeight: 1.4 }}>Purii wants to {renderRich(proposal.summary)}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                      <button onClick={confirmProposal} disabled={loading} style={confirmBtn}>Confirm</button>
                      <button onClick={() => { setProposal(null); setFace("hero"); }} style={cancelBtn}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); send(input); }} style={{ display: "flex", gap: 8, padding: 12, borderTop: power ? "1px solid #1e3a5f" : "1px solid var(--color-border)", background: power ? "#0b1220" : undefined }}>
                <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={matrix ? "Ask about the system or tell me what to change…" : power ? "Tell me what to do…" : "How do I…?"} style={power ? askInputBypass : askInput} />
                <button type="submit" disabled={loading} style={matrix ? sendBtnMatrix : bypass ? sendBtnBypass : sendBtn}>{power ? "Go" : "Ask"}</button>
              </form>
            </>
          ) : (
            <div style={{ ...body, display: "flex", flexDirection: "column" }}>
              <div style={{ display: "flex", justifyContent: "center", padding: "8px 0 14px" }}>
                <img key={cur.sprite} className="purii-pop" src={sprite(cur.sprite)} alt="" style={{ height: 124, objectFit: "contain", animation: "purii-pop .42s cubic-bezier(.34,1.56,.64,1), purii-float 3s ease-in-out infinite .42s" }} />
              </div>
              <div style={{ fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-lg)", marginBottom: 6 }}>{cur.title}</div>
              <p style={{ margin: 0, fontSize: "var(--text-sm)", color: "var(--color-text-secondary)" }}>{cur.body}</p>
              {cur.href && (
                <button onClick={() => router.push(cur.href!)} style={{ ...tourLink, background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left" }}>{cur.cta || "Open"} →</button>
              )}
              <div style={{ marginTop: "auto", paddingTop: 14, display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} style={navBtn(step === 0)}>Back</button>
                <div style={{ flex: 1, display: "flex", gap: 4, justifyContent: "center" }}>
                  {tour.map((_, i) => <span key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: i === step ? "var(--color-sky-500)" : "var(--color-neutral-200)" }} />)}
                </div>
                {step < tour.length - 1 ? <button onClick={() => setStep((s) => s + 1)} style={navBtn(false)}>Next</button> : <button onClick={() => setTab("ask")} style={navBtn(false)}>Done</button>}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

const fab: CSSProperties = { position: "fixed", right: 22, bottom: 22, zIndex: 60, width: 64, height: 64, borderRadius: "50%", border: "none", cursor: "pointer", background: "linear-gradient(145deg, var(--color-sky-400), var(--color-sky-500))", boxShadow: "0 8px 24px rgba(77,196,232,.4)", display: "flex", alignItems: "center", justifyContent: "center" };
const fabBypass: CSSProperties = { ...fab, width: 84, height: 84, background: "radial-gradient(circle at 50% 36%, #cffafe 0%, #38bdf8 48%, #0369a1 100%)" };
const panel: CSSProperties = { position: "fixed", right: 22, bottom: 98, zIndex: 60, width: "min(380px, calc(100vw - 32px))", height: "min(560px, calc(100vh - 140px))", display: "flex", flexDirection: "column", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", boxShadow: "0 24px 70px rgba(16,24,32,.32)", overflow: "hidden" };
const panelBypass: CSSProperties = { ...panel, border: "1px solid #1e3a5f", boxShadow: "0 0 0 1px rgba(125,249,255,.3), 0 24px 70px rgba(8,12,30,.6)" };
const header: CSSProperties = { display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", background: "linear-gradient(145deg, var(--color-navy-800), var(--color-navy-900))" };
const headerBypass: CSSProperties = { ...header, background: "linear-gradient(145deg, #0c1a3a, #061024)", borderBottom: "1px solid #1e3a5f" };
const closeBtn: CSSProperties = { background: "transparent", border: "none", color: "rgba(255,255,255,.8)", fontSize: 24, cursor: "pointer", lineHeight: 1 };
const iconBtn: CSSProperties = { background: "transparent", border: "none", color: "rgba(255,255,255,.85)", fontSize: 16, cursor: "pointer", lineHeight: 1, padding: 2 };
const badge: CSSProperties = { position: "absolute", top: -2, right: -2, minWidth: 22, height: 22, padding: "0 5px", borderRadius: 999, background: "var(--color-error)", color: "#fff", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff", boxShadow: "0 2px 6px rgba(0,0,0,.25)" };
const notifBlock: CSSProperties = { background: "var(--color-sky-50)", border: "1px solid var(--color-sky-100)", borderRadius: "var(--radius-lg)", padding: 12, marginBottom: 12 };
const notifItem: CSSProperties = { display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", border: "none", background: "transparent", cursor: "pointer", padding: "7px 4px", fontSize: "var(--text-sm)", color: "var(--color-navy-900)", borderTop: "1px solid var(--color-sky-100)" };
const notifCount: CSSProperties = { flexShrink: 0, minWidth: 22, height: 22, borderRadius: 6, background: "var(--color-sky-400)", color: "#fff", fontWeight: 700, fontSize: 12, display: "inline-flex", alignItems: "center", justifyContent: "center" };
const exitBtn: CSSProperties = { background: "rgba(125,249,255,.15)", border: "1px solid rgba(125,249,255,.4)", color: "#7df9ff", fontSize: 11, borderRadius: 6, padding: "3px 8px", cursor: "pointer" };
const tabs: CSSProperties = { display: "flex", borderBottom: "1px solid var(--color-border)" };
const tabBtn = (active: boolean): CSSProperties => ({ flex: 1, padding: "10px", border: "none", cursor: "pointer", fontSize: "var(--text-sm)", fontWeight: 600, background: active ? "var(--color-surface)" : "var(--color-bg-secondary)", color: active ? "var(--color-navy-900)" : "var(--color-text-secondary)", borderBottom: active ? "2px solid var(--color-sky-400)" : "2px solid transparent" });
const body: CSSProperties = { flex: 1, overflowY: "auto", padding: 14 };
const chip: CSSProperties = { textAlign: "left", padding: "8px 12px", borderRadius: "var(--radius-lg)", border: "1px solid var(--color-border)", background: "var(--color-bg-secondary)", cursor: "pointer", fontSize: "var(--text-sm)", color: "var(--color-navy-800)" };
const bubble = (you: boolean, mode: "matrix" | "bypass" | null): CSSProperties => ({ maxWidth: "82%", padding: "9px 12px", borderRadius: 14, fontSize: "var(--text-sm)", lineHeight: 1.45, whiteSpace: "pre-wrap", background: you ? (mode === "matrix" ? "#16a34a" : mode === "bypass" ? "#0ea5e9" : "var(--color-navy-900)") : (mode === "matrix" ? "#0f2a1a" : mode === "bypass" ? "#13233f" : "var(--color-bg-tertiary)"), color: you ? "#fff" : (mode === "matrix" ? "#dcfce7" : mode === "bypass" ? "#dbeafe" : "var(--color-text-primary)") });
const proposalCard: CSSProperties = { border: "1px solid #38bdf8", background: "linear-gradient(145deg,#0c2545,#0a1830)", borderRadius: 12, padding: 14, margin: "6px 0", boxShadow: "0 0 0 1px rgba(56,189,248,.25)" };
const confirmBtn: CSSProperties = { flex: 1, border: "none", borderRadius: 999, padding: "9px", background: "linear-gradient(180deg,#22d3ee,#0ea5e9)", color: "#06121f", fontWeight: 700, cursor: "pointer" };
const cancelBtn: CSSProperties = { flex: 1, border: "1px solid rgba(255,255,255,.2)", borderRadius: 999, padding: "9px", background: "transparent", color: "#cbd5e1", fontWeight: 600, cursor: "pointer" };
const askInput: CSSProperties = { flex: 1, border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "9px 11px", font: "inherit", fontSize: "var(--text-sm)" };
const askInputBypass: CSSProperties = { ...askInput, background: "#13233f", border: "1px solid #1e3a5f", color: "#fff" };
const sendBtn: CSSProperties = { border: "none", borderRadius: "var(--radius-input)", padding: "0 16px", background: "var(--color-navy-900)", color: "#fff", fontWeight: 600, cursor: "pointer" };
const sendBtnBypass: CSSProperties = { ...sendBtn, background: "linear-gradient(180deg,#22d3ee,#0ea5e9)", color: "#06121f", fontWeight: 700 };
// Matrix mode — green-themed variants (vs Bypass's cyan).
const fabMatrix: CSSProperties = { ...fab, width: 84, height: 84, background: "radial-gradient(circle at 50% 36%, #dcfce7 0%, #22c55e 48%, #166534 100%)" };
const panelMatrix: CSSProperties = { ...panel, border: "1px solid #14532d", boxShadow: "0 0 0 1px rgba(74,222,128,.3), 0 24px 70px rgba(6,20,12,.6)" };
const headerMatrix: CSSProperties = { ...header, background: "linear-gradient(145deg, #0c2a1a, #04140a)", borderBottom: "1px solid #14532d" };
const sendBtnMatrix: CSSProperties = { ...sendBtn, background: "linear-gradient(180deg,#4ade80,#16a34a)", color: "#04140a", fontWeight: 700 };
const tourLink: CSSProperties = { display: "inline-block", marginTop: 12, color: "var(--color-sky-600)", fontWeight: 600, fontSize: "var(--text-sm)" };
const navBtn = (disabled: boolean): CSSProperties => ({ border: "1px solid var(--color-border)", background: "var(--color-surface)", borderRadius: "var(--radius-button)", padding: "7px 16px", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.4 : 1, fontSize: "var(--text-sm)", fontWeight: 600 });
