// Mission Control — shared visual primitives + the scoped stylesheet.
// One <GlobalStyle/> injects every `mc-` class (responsive + hover states that
// inline styles can't express); components below compose those classes. Palette
// per docs 05/08/F: deep navy #0d1d5f, sky accents, warm off-white, 18px cards.

import type { CSSProperties, ReactNode } from "react";
import type { StatusTone } from "./lib";

// ── Scoped stylesheet ──────────────────────────────────────────────────────

export function GlobalStyle() {
  return (
    <style>{CSS}</style>
  );
}

const CSS = `
.mc-root {
  --mc-navy: #0d1d5f;
  --mc-navy-2: #16277a;
  --mc-sky: #4dc4e8;
  --mc-sky-ink: #157ba0;
  --mc-bg: #f6f5f2;
  --mc-surface: #ffffff;
  --mc-raised: #fbfaf7;
  --mc-border: #e8e6e0;
  --mc-border-subtle: #f1f0ea;
  --mc-ink: #1d1d1f;
  --mc-ink-2: #6e6e73;
  --mc-ink-3: #9b9a95;
  --mc-success: #30c97a;
  --mc-success-dark: #1a7a4a;
  --mc-success-bg: #e5f7ee;
  --mc-warn: #ffb340;
  --mc-warn-bg: #fff6e2;
  --mc-warn-border: #ffe1a3;
  --mc-warn-ink: #8a5a00;
  --mc-r: 18px;
  font-family: var(--font-sans, 'DM Sans', system-ui, sans-serif);
  color: var(--mc-ink);
  background: var(--mc-bg);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
  line-height: 1.5;
}
.mc-root *, .mc-root *::before, .mc-root *::after { box-sizing: border-box; }
.mc-root button { font-family: inherit; }
.mc-display { font-family: var(--font-display, 'Outfit', sans-serif); }

/* Layout */
.mc-layout { display: flex; min-height: 100vh; }
.mc-sidebar {
  width: 224px; flex: 0 0 224px; background: var(--mc-surface);
  border-right: 1px solid var(--mc-border); display: flex; flex-direction: column;
  position: sticky; top: 0; height: 100vh;
}
.mc-main { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
.mc-content { flex: 1 1 auto; padding: 28px 32px 96px; max-width: 1120px; width: 100%; margin: 0 auto; }

/* Sidebar */
.mc-brand { padding: 20px 18px 14px; display: flex; align-items: center; gap: 10px; }
.mc-brand-mark {
  width: 30px; height: 30px; border-radius: 9px; flex: 0 0 30px;
  background: linear-gradient(140deg, var(--mc-navy), var(--mc-navy-2));
  display: grid; place-items: center; color: #fff; font-weight: 800; font-size: 14px;
}
.mc-nav { padding: 6px 12px; display: flex; flex-direction: column; gap: 2px; }
.mc-nav-item {
  display: flex; align-items: center; gap: 11px; padding: 9px 12px; border-radius: 12px;
  border: none; background: transparent; color: var(--mc-ink-2); font-size: 14px; font-weight: 600;
  cursor: pointer; text-align: left; width: 100%; transition: background .15s, color .15s;
}
.mc-nav-item:hover { background: var(--mc-raised); color: var(--mc-ink); }
.mc-nav-item[data-active="true"] { background: #eaf0ff; color: var(--mc-navy); }
.mc-nav-item svg { width: 18px; height: 18px; flex: 0 0 18px; }
.mc-profile {
  margin-top: auto; padding: 14px; border-top: 1px solid var(--mc-border-subtle);
}
.mc-profile-card {
  display: flex; align-items: center; gap: 10px; padding: 10px; border-radius: 14px;
  background: linear-gradient(135deg, #eaf6fb, #eef2ff);
}
.mc-avatar {
  width: 36px; height: 36px; flex: 0 0 36px; border-radius: 50%; display: grid; place-items: center;
  background: linear-gradient(140deg, var(--mc-navy), var(--mc-navy-2)); color: #fff;
  font-weight: 700; font-size: 13px; letter-spacing: .02em;
}

/* HUD */
.mc-hud {
  position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 12px;
  padding: 12px 24px; background: rgba(246,245,242,.85); backdrop-filter: saturate(1.4) blur(10px);
  border-bottom: 1px solid var(--mc-border);
}
.mc-hud-spacer { flex: 1 1 auto; }

/* Chips / badges */
.mc-chip {
  display: inline-flex; align-items: center; gap: 6px; padding: 5px 11px; border-radius: 999px;
  font-size: 12px; font-weight: 600; background: var(--mc-surface); border: 1px solid var(--mc-border);
  color: var(--mc-ink-2); white-space: nowrap;
}
.mc-chip.mono { font-family: var(--font-mono, monospace); font-variant-numeric: tabular-nums; }
.mc-badge {
  display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px;
  font-size: 11px; font-weight: 700; letter-spacing: .01em; white-space: nowrap;
}
.mc-badge[data-tone="neutral"] { background: #eef0f4; color: #5b6472; }
.mc-badge[data-tone="active"]  { background: #e2f4fb; color: var(--mc-sky-ink); }
.mc-badge[data-tone="review"]  { background: #ece8ff; color: #5b45c9; }
.mc-badge[data-tone="revision"]{ background: var(--mc-warn-bg); color: var(--mc-warn-ink); }
.mc-badge[data-tone="done"]    { background: var(--mc-success-bg); color: var(--mc-success-dark); }
.mc-kindtag {
  font-size: 10.5px; font-weight: 800; letter-spacing: .1em; color: var(--mc-ink-3);
  text-transform: uppercase;
}

/* Cards */
.mc-card {
  background: var(--mc-surface); border: 1px solid var(--mc-border); border-radius: var(--mc-r);
  box-shadow: 0 1px 2px rgba(13,29,95,.04), 0 6px 20px rgba(13,29,95,.05);
}
.mc-card-pad { padding: 20px; }
.mc-section-title {
  font-size: 11px; font-weight: 800; letter-spacing: .09em; text-transform: uppercase;
  color: var(--mc-ink-3); margin: 0 0 10px;
}

/* Buttons */
.mc-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
  padding: 10px 18px; border-radius: 999px; border: 1px solid transparent; cursor: pointer;
  font-size: 14px; font-weight: 700; transition: transform .06s, box-shadow .15s, background .15s, opacity .15s;
}
.mc-btn:active { transform: translateY(1px); }
.mc-btn:disabled { opacity: .5; cursor: not-allowed; }
.mc-btn-primary { background: var(--mc-navy); color: #fff; box-shadow: 0 6px 16px rgba(13,29,95,.22); }
.mc-btn-primary:hover:not(:disabled) { background: #10236e; }
.mc-btn-ghost { background: var(--mc-surface); color: var(--mc-ink); border-color: var(--mc-border); }
.mc-btn-ghost:hover:not(:disabled) { background: var(--mc-raised); }
.mc-btn-sky { background: var(--mc-sky); color: #06364a; box-shadow: 0 6px 16px rgba(77,196,232,.28); }
.mc-btn-sky:hover:not(:disabled) { background: #3bbbe2; }
.mc-btn-sm { padding: 7px 13px; font-size: 13px; }

/* Inputs */
.mc-input, .mc-textarea {
  width: 100%; border: 1px solid var(--mc-border); border-radius: 12px; padding: 10px 12px;
  font: inherit; font-size: 14px; background: var(--mc-surface); color: var(--mc-ink);
  transition: border-color .15s, box-shadow .15s;
}
.mc-textarea { resize: vertical; min-height: 90px; line-height: 1.55; }
.mc-input:focus, .mc-textarea:focus {
  outline: none; border-color: var(--mc-sky); box-shadow: 0 0 0 3px rgba(77,196,232,.18);
}
.mc-label { display: block; font-size: 12px; font-weight: 700; color: var(--mc-ink-2); margin: 0 0 6px; }

/* Toggle chips (days / blocks / checkboxes) */
.mc-toggle {
  padding: 8px 14px; border-radius: 999px; border: 1px solid var(--mc-border); background: var(--mc-surface);
  font-size: 13px; font-weight: 600; color: var(--mc-ink-2); cursor: pointer; transition: all .15s;
}
.mc-toggle:hover { border-color: var(--mc-sky); }
.mc-toggle[data-on="true"] { background: var(--mc-navy); border-color: var(--mc-navy); color: #fff; }

/* Grids */
.mc-grid-home { display: grid; grid-template-columns: 1fr 320px; gap: 20px; align-items: start; }
.mc-grid-missions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; }
.mc-grid-2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; align-items: start; }
.mc-grid-detail { display: grid; grid-template-columns: 1fr 300px; gap: 20px; align-items: start; }

/* Message bubbles */
.mc-msg { display: flex; gap: 10px; margin-bottom: 14px; }
.mc-msg-mine { flex-direction: row-reverse; }
.mc-bubble {
  max-width: 74%; padding: 10px 13px; border-radius: 14px; font-size: 14px; line-height: 1.5;
  border: 1px solid var(--mc-border-subtle); background: var(--mc-surface);
}
.mc-msg-mine .mc-bubble { background: var(--mc-navy); color: #fff; border-color: transparent; }

/* Speech bubble (Purii) */
.mc-speech {
  position: relative; background: linear-gradient(160deg, #0d1d5f, #1a2f8f); color: #fff;
  border-radius: 16px; padding: 16px; font-size: 14px; line-height: 1.55;
}
.mc-ai-badge {
  display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 999px;
  font-size: 10px; font-weight: 800; letter-spacing: .04em; background: rgba(255,255,255,.16); color: #cfe8ff;
}

/* Modal */
.mc-overlay {
  position: fixed; inset: 0; z-index: 60; background: rgba(13,29,95,.42);
  display: grid; place-items: center; padding: 20px; backdrop-filter: blur(3px);
}
.mc-modal {
  background: var(--mc-surface); border-radius: 22px; width: 100%; max-width: 480px;
  box-shadow: 0 30px 70px rgba(13,29,95,.3); padding: 24px; animation: mc-pop .16s ease-out;
}
@keyframes mc-pop { from { transform: scale(.97); opacity: .4; } to { transform: scale(1); opacity: 1; } }

/* Skeletons */
.mc-skel { background: linear-gradient(90deg, #ecebe6 25%, #f4f3ee 37%, #ecebe6 63%);
  background-size: 400% 100%; animation: mc-shimmer 1.3s ease-in-out infinite; border-radius: 10px; }
@keyframes mc-shimmer { 0% { background-position: 100% 0; } 100% { background-position: 0 0; } }

/* Progress bar */
.mc-track { height: 9px; border-radius: 999px; background: #ece9e2; overflow: hidden; }
.mc-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, var(--mc-sky), var(--mc-success)); transition: width .4s ease; }

/* Bottom nav (mobile) */
.mc-bottomnav { display: none; }

@media (max-width: 900px) {
  .mc-grid-home, .mc-grid-detail { grid-template-columns: 1fr; }
  .mc-grid-missions { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 768px) {
  .mc-sidebar { display: none; }
  .mc-content { padding: 18px 16px 92px; }
  .mc-grid-missions, .mc-grid-2 { grid-template-columns: 1fr; }
  .mc-hud { padding: 10px 14px; gap: 8px; }
  .mc-bottomnav {
    display: flex; position: fixed; bottom: 0; left: 0; right: 0; z-index: 40;
    background: var(--mc-surface); border-top: 1px solid var(--mc-border);
    padding: 6px 4px calc(6px + env(safe-area-inset-bottom, 0px));
  }
  .mc-bottomnav button {
    flex: 1; display: flex; flex-direction: column; align-items: center; gap: 3px;
    border: none; background: transparent; color: var(--mc-ink-3); font-size: 10px; font-weight: 600;
    padding: 5px 2px; cursor: pointer;
  }
  .mc-bottomnav button svg { width: 20px; height: 20px; }
  .mc-bottomnav button[data-active="true"] { color: var(--mc-navy); }
  .mc-onb { grid-template-columns: 1fr !important; }
  .mc-onb-left { border-radius: 0 !important; }
}
`;

// ── Primitives ──────────────────────────────────────────────────────────────

export function Card({ children, className = "", style, onClick }: {
  children: ReactNode; className?: string; style?: CSSProperties; onClick?: () => void;
}) {
  return (
    <div className={`mc-card ${className}`} style={style} onClick={onClick}>
      {children}
    </div>
  );
}

export function Badge({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className="mc-badge" data-tone={tone}>{children}</span>;
}

export function Chip({ children, mono }: { children: ReactNode; mono?: boolean }) {
  return <span className={`mc-chip${mono ? " mono" : ""}`}>{children}</span>;
}

export function Icon({ path, size = 18 }: { path: string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

export function AiBadge() {
  return <span className="mc-ai-badge">✦ AI</span>;
}

export function Skeleton({ h = 16, w = "100%", style }: { h?: number; w?: number | string; style?: CSSProperties }) {
  return <div className="mc-skel" style={{ height: h, width: w, ...style }} />;
}

// Full-page states shared by loader / error / expired-token screens.
export function CenteredCard({ emoji, title, body, action }: {
  emoji: string; title: string; body: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="mc-root" style={{ display: "grid", placeItems: "center", padding: 24 }}>
      <Card className="mc-card-pad" style={{ maxWidth: 440, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 8 }}>{emoji}</div>
        <h1 className="mc-display" style={{ fontSize: 22, fontWeight: 800, margin: "0 0 8px", color: "var(--mc-navy)" }}>{title}</h1>
        <p style={{ color: "var(--mc-ink-2)", fontSize: 15, margin: 0, lineHeight: 1.55 }}>{body}</p>
        {action && <div style={{ marginTop: 18 }}>{action}</div>}
      </Card>
    </div>
  );
}
