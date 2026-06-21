"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { IconSend, IconCheck } from "@/components/icons";

type RequestItem = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

const label: React.CSSProperties = {
  display: "block",
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: "var(--color-text-tertiary)",
  marginBottom: 6,
};
const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "11px 13px",
  font: "inherit",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-primary)",
  background: "#fff",
  outline: "none",
};
const PRIORITIES = ["Low", "Medium", "High"] as const;

export default function ClientRequestsPage() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    priorityPreference: "Medium",
    dueDatePreference: "",
    fileReference: "",
  });

  function loadRequests() {
    fetch("/api/client/requests")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d) => {
        setRequests(d.requests ?? []);
        setLoaded(true);
      })
      .catch(() => {
        setLoadError("Failed to load requests. Please refresh.");
        setLoaded(true);
      });
  }

  useEffect(loadRequests, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/client/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          priorityPreference: form.priorityPreference,
          dueDatePreference: form.dueDatePreference || null,
          fileReference: form.fileReference || null,
        }),
      });
      if (res.ok) {
        setSubmitted(true);
        setForm({ title: "", description: "", priorityPreference: "Medium", dueDatePreference: "", fileReference: "" });
        loadRequests();
      } else {
        setSubmitError("Failed to submit request. Please try again.");
      }
    } catch {
      setSubmitError("Failed to submit request. Please try again.");
    }
    setSubmitting(false);
  }

  return (
    <div className="dash-stage">
      <h1 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-3xl)", letterSpacing: "-.03em", color: "var(--color-navy-900)" }}>
        Requests
      </h1>
      <p style={{ margin: "0 0 22px", fontSize: "var(--text-base)", color: "var(--color-text-secondary)" }}>
        Ask for anything — your team triages it, assigns the right person, and keeps you posted.
      </p>

      <div className="two-col">
        {/* new request form */}
        <div className="surface" style={{ padding: 24, borderRadius: "var(--radius-card)", boxShadow: "var(--shadow-sm)" }}>
          {submitted ? (
            <div style={{ textAlign: "center", padding: "14px 6px" }} className="purii-pop">
              <span style={{ display: "inline-flex", width: 56, height: 56, borderRadius: "50%", background: "var(--color-success-light)", color: "var(--color-success-dark)", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <IconCheck size={26} />
              </span>
              <h3 style={{ margin: "0 0 6px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-xl)", color: "var(--color-navy-900)" }}>Got it — we&apos;re on it</h3>
              <p style={{ margin: "0 auto 18px", maxWidth: "36ch", fontSize: "var(--text-sm)", color: "var(--color-text-secondary)", lineHeight: 1.55 }}>
                Your request landed with the team. We&apos;ll triage it and assign someone — you&apos;ll see updates on the right.
              </p>
              <button type="button" onClick={() => setSubmitted(false)} style={{ appearance: "none", cursor: "pointer", font: "inherit", fontWeight: 600, fontSize: "var(--text-sm)", color: "var(--color-sky-600)", background: "none", border: "none" }}>
                Submit another request
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h3 style={{ margin: "0 0 4px", fontFamily: "var(--font-display)", fontWeight: 700, fontSize: "var(--text-lg)", color: "var(--color-navy-900)" }}>Submit a new request</h3>
              <p style={{ margin: "0 0 18px", fontSize: "var(--text-sm)", color: "var(--color-text-tertiary)" }}>The more detail you give, the faster we can run with it.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 15 }}>
                <div>
                  <label style={label}>What do you need?</label>
                  <input required placeholder="e.g. Schedule next month's newsletter" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={input} />
                </div>
                <div>
                  <label style={label}>A few details</label>
                  <textarea required rows={4} placeholder="What's the goal, and anything we should know?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} style={{ ...input, resize: "vertical" }} />
                </div>
                <div>
                  <label style={label}>How urgent?</label>
                  <div style={{ display: "flex", gap: 8 }}>
                    {PRIORITIES.map((p) => {
                      const active = form.priorityPreference === p;
                      return (
                        <button key={p} type="button" onClick={() => setForm({ ...form, priorityPreference: p })} style={{ flex: 1, appearance: "none", cursor: "pointer", font: "inherit", fontSize: "var(--text-sm)", fontWeight: 600, padding: "9px 0", borderRadius: "var(--radius-input)", border: `1.5px solid ${active ? "var(--color-sky-400)" : "var(--color-border)"}`, background: active ? "var(--color-sky-50)" : "var(--color-surface)", color: active ? "var(--color-sky-700)" : "var(--color-text-secondary)" }}>
                          {p}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <label style={label}>Needed by (optional)</label>
                  <input type="date" value={form.dueDatePreference} onChange={(e) => setForm({ ...form, dueDatePreference: e.target.value })} style={input} />
                </div>
                <div>
                  <label style={label}>File reference (optional)</label>
                  <input placeholder="Link or description" value={form.fileReference} onChange={(e) => setForm({ ...form, fileReference: e.target.value })} style={input} />
                </div>
                {submitError && <p style={{ color: "var(--color-error)", fontSize: "var(--text-sm)", margin: 0 }}>{submitError}</p>}
                <div style={{ marginTop: 2 }}>
                  <button type="submit" className="btn btn-primary" disabled={submitting} style={{ opacity: submitting ? 0.6 : 1 }}>
                    <IconSend size={16} /> {submitting ? "Sending…" : "Send to my team"}
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>

        {/* request list */}
        <div>
          <div style={{ fontSize: "var(--text-xs)", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--color-text-tertiary)", marginBottom: 12 }}>Your requests</div>
          {loadError && <p style={{ color: "var(--color-error)", fontSize: "var(--text-sm)" }}>{loadError}</p>}
          {loaded && !loadError && requests.length === 0 && (
            <div className="surface" style={{ padding: 20 }}>
              <span className="small" style={{ color: "var(--color-text-tertiary)" }}>No requests yet.</span>
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {requests.map((r) => (
              <Link key={r.id} href={`/client/requests/${r.id}`} className="surface" style={{ display: "block", padding: "15px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 11 }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: "var(--text-sm)", fontWeight: 600, color: "var(--color-text-primary)" }}>{r.title}</div>
                    <div style={{ fontSize: "var(--text-2xs)", color: "var(--color-text-tertiary)", marginTop: 3 }}>{new Date(r.createdAt).toLocaleDateString()}</div>
                  </div>
                  <StatusPill status={r.status} />
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
