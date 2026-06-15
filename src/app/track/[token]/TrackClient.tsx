"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";

type Task = {
  assignmentId: string;
  kind: string;
  task: string;
  instructions: string | null;
  instructionsLink: string | null;
  skill: string | null;
  estMinutes: number | null;
  status: string;
  minutesSpent: number;
  outputLink: string | null;
  note: string | null;
  running: boolean;
};
type State = {
  name: string | null;
  deadline: string | null;
  tasks: Task[];
  openTaskId: string | null;
  openSince: string | null;
  doneCount: number;
  totalCount: number;
  readyForReview: boolean;
};

const KIND: Record<string, { icon: string; open?: string; done: string }> = {
  read: { icon: "📖", done: "Mark as read" },
  video: { icon: "▶", open: "Open video", done: "Mark as watched" },
  quiz: { icon: "📝", open: "Open quiz", done: "Mark quiz done" },
  task: { icon: "✅", done: "Mark task done" },
  submit: { icon: "📤", open: "Open submission form", done: "Mark as submitted" },
};

async function post(path: string, body: Record<string, unknown>) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: "Bad response" }));
}
function fmt(totalSec: number) {
  const m = Math.floor(totalSec / 60);
  return `${String(m).padStart(2, "0")}:${String(totalSec % 60).padStart(2, "0")}`;
}

export function TrackClient({ token }: { token: string }) {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, { link: string; note: string; open: boolean }>>({});
  const tick = useRef<number | null>(null);

  const load = useCallback(async () => {
    const res = await post("/api/training/state", { token });
    if (!res.ok) { setError(res.error || "This link is invalid or expired."); return; }
    setError(null);
    setState(res.result as State);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (tick.current) { window.clearInterval(tick.current); tick.current = null; }
    if (state?.openSince) {
      const start = new Date(state.openSince).getTime();
      const upd = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
      upd();
      tick.current = window.setInterval(upd, 1000);
    } else setElapsed(0);
    return () => { if (tick.current) window.clearInterval(tick.current); };
  }, [state?.openSince, state?.openTaskId]);

  function draft(id: string) { return drafts[id] ?? { link: "", note: "", open: false }; }
  function setDraft(id: string, patch: Partial<{ link: string; note: string; open: boolean }>) {
    setDrafts((d) => ({ ...d, [id]: { ...draft(id), ...patch } }));
  }
  async function act(key: string, path: string, body: Record<string, unknown>) {
    setBusy(key);
    const res = await post(path, { token, ...body });
    setBusy("");
    if (!res.ok) { window.alert(res.error || "Something went wrong"); return; }
    setState(res.result as State);
  }

  if (error) {
    return (
      <div style={page}><div style={card}>
        <img src="/purii/surprised.png" alt="" style={{ height: 90, objectFit: "contain" }} />
        <h1 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-2xl)" }}>Link not valid</h1>
        <p style={{ color: "var(--color-text-secondary)" }}>{error}</p>
      </div></div>
    );
  }
  if (!state) return <div style={page}><div style={{ color: "var(--color-text-secondary)" }}>Loading…</div></div>;

  const pct = state.totalCount ? Math.round((state.doneCount / state.totalCount) * 100) : 0;
  const someRunning = state.openTaskId != null;

  return (
    <div style={page}>
      <div style={{ ...card, alignItems: "stretch", textAlign: "left", maxWidth: 640 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, justifyContent: "center", marginBottom: 4 }}>
          <img src="/purii/waving.png" alt="" style={{ height: 56, objectFit: "contain" }} />
          <div>
            <div style={{ fontFamily: "var(--font-display)", fontWeight: 800, fontSize: "var(--text-xl)", color: "var(--color-navy-900)" }}>PWA 10-Hour Training</div>
            <div className="small">Hi {state.name ?? "there"} — read the modules, watch the tutorials, take the quiz, do the tasks, and submit. Start the timer for each item, then mark it done. You can do it across multiple sittings.</div>
          </div>
        </div>

        <div style={box}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={label}>Progress</span>
            <span className="small">{state.doneCount} of {state.totalCount} done</span>
          </div>
          <div style={{ height: 12, background: "var(--color-bg-tertiary)", borderRadius: 999, overflow: "hidden" }}>
            <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,var(--color-sky-400),var(--color-success))" }} />
          </div>
        </div>

        {state.readyForReview && (
          <div style={{ ...box, background: "var(--color-success-light)", color: "var(--color-success-dark)", textAlign: "center", fontWeight: 600 }}>
            🎉 All done — your training has been submitted for review. Thank you!
          </div>
        )}

        {state.tasks.length === 0 && <div style={box}><div className="small">No training items are set up yet. Please contact your recruiter.</div></div>}

        {state.tasks.map((t) => {
          const d = draft(t.assignmentId);
          const done = t.status === "done";
          const meta = KIND[t.kind] ?? KIND.task;
          const isTask = t.kind === "task";
          return (
            <div key={t.assignmentId} style={{ ...box, borderLeft: done ? "3px solid var(--color-success)" : t.running ? "3px solid var(--color-sky-400)" : "3px solid var(--color-border)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "baseline" }}>
                <div style={{ fontWeight: 700 }}>{done ? "✓ " : `${meta.icon} `}{t.task}</div>
                <div className="small" style={{ whiteSpace: "nowrap" }}>
                  {t.estMinutes ? `~${t.estMinutes} min` : ""}{t.minutesSpent ? ` · ${t.minutesSpent}m logged` : ""}
                </div>
              </div>
              {t.instructions && <div className="small" style={{ marginTop: 6, color: "var(--color-text-secondary)", whiteSpace: "pre-wrap" }}>{t.instructions}</div>}
              {t.instructionsLink && <a href={t.instructionsLink} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 8, color: "var(--color-sky-600)", fontSize: "var(--text-sm)", fontWeight: 700 }}>{meta.open ?? "Open"} →</a>}

              {done ? (
                <div className="small" style={{ marginTop: 8 }}>
                  Done{t.outputLink ? <> · <a href={t.outputLink} target="_blank" rel="noreferrer" style={{ color: "var(--color-sky-600)" }}>your work →</a></> : ""}
                </div>
              ) : (
                <div style={{ marginTop: 10 }}>
                  {t.running ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 26, fontWeight: 700, color: "var(--color-navy-900)" }}>{fmt(elapsed)}</span>
                      <button onClick={() => act("stop", "/api/training/stop", {})} disabled={!!busy} style={ghost}>Pause</button>
                    </div>
                  ) : (
                    <button onClick={() => act("start-" + t.assignmentId, "/api/training/start", { assignmentId: t.assignmentId })} disabled={!!busy || someRunning} style={ghost}>
                      {someRunning ? "Finish your other timer first" : "▶ Start timer"}
                    </button>
                  )}

                  {isTask ? (
                    <>
                      <button onClick={() => setDraft(t.assignmentId, { open: !d.open })} style={{ ...linkBtn, marginLeft: 12 }}>{d.open ? "Hide" : meta.done}</button>
                      {d.open && (
                        <div style={{ marginTop: 10, display: "grid", gap: 8 }}>
                          <input style={input} placeholder="Link to your work (optional)" value={d.link} onChange={(e) => setDraft(t.assignmentId, { link: e.target.value })} />
                          <input style={input} placeholder="A note for the reviewer (optional)" value={d.note} onChange={(e) => setDraft(t.assignmentId, { note: e.target.value })} />
                          <button onClick={() => act("done-" + t.assignmentId, "/api/training/complete", { assignmentId: t.assignmentId, outputLink: d.link, note: d.note })} disabled={!!busy} style={{ ...primary, justifySelf: "start" }}>✓ {meta.done}</button>
                        </div>
                      )}
                    </>
                  ) : (
                    <button onClick={() => act("done-" + t.assignmentId, "/api/training/complete", { assignmentId: t.assignmentId })} disabled={!!busy} style={{ ...primary, marginLeft: 12 }}>✓ {meta.done}</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const page: CSSProperties = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "linear-gradient(180deg, var(--color-sky-50), var(--color-bg-secondary))" };
const card: CSSProperties = { display: "flex", flexDirection: "column", gap: 14, background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-lg)", padding: 28, width: "100%", maxWidth: 460 };
const box: CSSProperties = { background: "var(--color-bg-secondary)", border: "1px solid var(--color-border-subtle)", borderRadius: "var(--radius-lg)", padding: 16 };
const label: CSSProperties = { fontSize: "var(--text-2xs)", textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--color-text-tertiary)", fontWeight: 700 };
const input: CSSProperties = { border: "1px solid var(--color-border)", borderRadius: "var(--radius-input)", padding: "9px 11px", font: "inherit", fontSize: "var(--text-sm)", background: "var(--color-surface)" };
const primary: CSSProperties = { border: "none", borderRadius: 8, padding: "9px 16px", background: "var(--color-navy-800, #132272)", color: "#fff", fontWeight: 700, fontSize: "var(--text-sm)", cursor: "pointer" };
const ghost: CSSProperties = { border: "1px solid var(--color-border)", borderRadius: 8, padding: "8px 14px", background: "var(--color-surface)", fontWeight: 600, fontSize: "var(--text-sm)", cursor: "pointer" };
const linkBtn: CSSProperties = { border: "none", background: "transparent", color: "var(--color-sky-600)", fontWeight: 600, fontSize: "var(--text-sm)", cursor: "pointer" };
