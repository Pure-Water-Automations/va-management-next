"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusPill } from "@/components/StatusPill";

type RequestItem = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
};

const h1: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--text-2xl)",
  fontWeight: "var(--weight-bold)",
  color: "var(--color-text-primary)",
  letterSpacing: "var(--tracking-tight)",
  margin: "0 0 var(--space-6)",
};
const h2: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--text-lg)",
  fontWeight: "var(--weight-semibold)",
  color: "var(--color-text-primary)",
  margin: "0 0 var(--space-3)",
};
const label: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  fontWeight: "var(--weight-semibold)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--color-text-tertiary)",
  marginBottom: "var(--space-1-5)",
  display: "block",
};
const input: React.CSSProperties = {
  width: "100%",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-input)",
  padding: "10px 12px",
  font: "inherit",
  fontSize: "var(--text-sm)",
  color: "var(--color-text-primary)",
  background: "var(--color-surface)",
};

export default function ClientRequestsPage() {
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    priorityPreference: "Medium",
    dueDatePreference: "",
    fileReference: "",
  });
  const router = useRouter();

  useEffect(() => {
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
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = {
        title: form.title,
        description: form.description,
        priorityPreference: form.priorityPreference,
        dueDatePreference: form.dueDatePreference || null,
        fileReference: form.fileReference || null,
      };
      const res = await fetch("/api/client/requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const { id } = await res.json();
        router.push(`/client/requests/${id}`);
      } else {
        setSubmitError("Failed to submit request. Please try again.");
        setSubmitting(false);
      }
    } catch {
      setSubmitError("Failed to submit request. Please try again.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={h1}>Requests</h1>

      <Card padding="var(--space-6)" style={{ marginBottom: "var(--space-8)" }}>
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          <h2 style={{ ...h2, marginBottom: 0 }}>Submit a new request</h2>
          <div>
            <label style={label}>Title</label>
            <input
              required
              placeholder="Short summary of what you need"
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              style={input}
            />
          </div>
          <div>
            <label style={label}>Details</label>
            <textarea
              required
              placeholder="Describe what you need…"
              rows={4}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              style={{ ...input, resize: "vertical" }}
            />
          </div>
          <div style={{ display: "flex", gap: "var(--space-4)", flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 160px" }}>
              <label style={label}>Priority</label>
              <select
                value={form.priorityPreference}
                onChange={(e) => setForm({ ...form, priorityPreference: e.target.value })}
                style={input}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
            <div style={{ flex: "1 1 160px" }}>
              <label style={label}>Preferred by</label>
              <input
                type="date"
                value={form.dueDatePreference}
                onChange={(e) => setForm({ ...form, dueDatePreference: e.target.value })}
                style={input}
              />
            </div>
          </div>
          <div>
            <label style={label}>File reference (optional)</label>
            <input
              placeholder="Link or description"
              value={form.fileReference}
              onChange={(e) => setForm({ ...form, fileReference: e.target.value })}
              style={input}
            />
          </div>
          {submitError && (
            <p style={{ color: "var(--color-error)", fontSize: "var(--text-sm)", margin: 0 }}>{submitError}</p>
          )}
          <Button type="submit" size="sm" loading={submitting} disabled={submitting} style={{ alignSelf: "flex-start" }}>
            {submitting ? "Submitting…" : "Submit request"}
          </Button>
        </form>
      </Card>

      <h2 style={h2}>Past requests</h2>
      {loadError && <p style={{ color: "var(--color-error)", fontSize: "var(--text-sm)" }}>{loadError}</p>}
      {loaded && !loadError && requests.length === 0 && (
        <Card padding="var(--space-6)">
          <p style={{ margin: 0, color: "var(--color-text-tertiary)" }}>No requests yet.</p>
        </Card>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
        {requests.map((r) => (
          <Link key={r.id} href={`/client/requests/${r.id}`} style={{ display: "block" }}>
            <Card padding="var(--space-4)">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "var(--space-3)",
                }}
              >
                <div style={{ fontWeight: "var(--weight-medium)", color: "var(--color-text-primary)" }}>
                  {r.title}
                </div>
                <StatusPill status={r.status} />
              </div>
              <div style={{ fontSize: "var(--text-xs)", color: "var(--color-text-tertiary)", marginTop: "var(--space-1-5)" }}>
                {new Date(r.createdAt).toLocaleDateString()}
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
