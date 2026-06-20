"use client";

import { useEffect, useState } from "react";

type State =
  | { ok: true; orgName: string; company: string; alreadySubmitted: boolean }
  | { ok: false; error: string };

const QUESTIONS: { key: string; label: string; hint?: string }[] = [
  { key: "primaryContact", label: "Who is our primary point of contact?", hint: "Name, role, best way to reach them" },
  { key: "priorityTasks", label: "What are the first tasks you'd like us to take off your plate?" },
  { key: "toolsUsed", label: "What tools and systems do you use?", hint: "Email, calendar, CRM, project tools, etc." },
  { key: "commsPreferences", label: "How do you prefer to communicate and how often?" },
  { key: "stakeholders", label: "Who else on your team/board should we know about?" },
  { key: "additionalNotes", label: "Anything else we should know to start strong?" },
];

async function post(path: string, body: Record<string, unknown>) {
  const r = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return r.json().catch(() => ({ ok: false, error: "Bad response" }));
}

export function IntakeClient({ token }: { token: string }) {
  const [state, setState] = useState<State | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    post("/api/intake/state", { token }).then(setState);
  }, [token]);

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await post("/api/intake/submit", { token, answers });
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.error || "Could not submit. Please try again.");
  }

  if (!state) return <Shell><p>Loading…</p></Shell>;
  if (!state.ok) return <Shell><h1>Link not valid</h1><p>{state.error}</p></Shell>;
  if (done || state.alreadySubmitted)
    return <Shell><h1>Thank you 🎉</h1><p>We've received your intake. Your onboarding owner will be in touch to schedule the kickoff call.</p></Shell>;

  return (
    <Shell>
      <h1>Welcome to {state.company}</h1>
      <p style={{ color: "#666" }}>A few quick questions to set up {state.orgName} for a strong start.</p>
      {QUESTIONS.map((q) => (
        <div key={q.key} style={{ marginTop: 18 }}>
          <label style={{ display: "block", fontWeight: 500, marginBottom: 6 }}>{q.label}</label>
          {q.hint && <p style={{ margin: "0 0 6px", fontSize: 13, color: "#888" }}>{q.hint}</p>}
          <textarea
            value={answers[q.key] ?? ""}
            onChange={(e) => setAnswers((a) => ({ ...a, [q.key]: e.target.value }))}
            style={{ width: "100%", minHeight: 70, padding: 10, borderRadius: 8, border: "1px solid #ccc", fontFamily: "inherit" }}
          />
        </div>
      ))}
      {error && <p style={{ color: "#c0392b" }}>{error}</p>}
      <button
        type="button"
        disabled={busy}
        onClick={submit}
        style={{ marginTop: 22, padding: "12px 24px", borderRadius: 8, border: "none", background: "#0b3d63", color: "#fff", fontWeight: 500 }}
      >
        {busy ? "Submitting…" : "Submit intake"}
      </button>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px", fontFamily: "system-ui, sans-serif" }}>{children}</div>;
}
