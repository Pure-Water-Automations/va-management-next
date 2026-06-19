"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type RequestItem = {
  id: string;
  title: string;
  status: string;
  createdAt: string;
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
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 24 }}>Requests</h1>

      <form
        onSubmit={handleSubmit}
        style={{ marginBottom: 40, display: "flex", flexDirection: "column", gap: 12 }}
      >
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Submit a new request</h2>
        <input
          required
          placeholder="Title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 14,
          }}
        />
        <textarea
          required
          placeholder="Describe what you need..."
          rows={4}
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 14,
            resize: "vertical",
          }}
        />
        <div style={{ display: "flex", gap: 12 }}>
          <select
            value={form.priorityPreference}
            onChange={(e) => setForm({ ...form, priorityPreference: e.target.value })}
            style={{
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 14,
            }}
          >
            <option value="Low">Low priority</option>
            <option value="Medium">Medium priority</option>
            <option value="High">High priority</option>
          </select>
          <input
            type="date"
            value={form.dueDatePreference}
            onChange={(e) => setForm({ ...form, dueDatePreference: e.target.value })}
            style={{
              padding: "8px 12px",
              border: "1px solid var(--border)",
              borderRadius: 6,
              fontSize: 14,
            }}
          />
        </div>
        <input
          placeholder="File reference (optional URL or description)"
          value={form.fileReference}
          onChange={(e) => setForm({ ...form, fileReference: e.target.value })}
          style={{
            padding: "8px 12px",
            border: "1px solid var(--border)",
            borderRadius: 6,
            fontSize: 14,
          }}
        />
        {submitError && (
          <p style={{ color: "#dc2626", fontSize: 14, margin: 0 }}>{submitError}</p>
        )}
        <button
          type="submit"
          disabled={submitting}
          style={{
            alignSelf: "flex-start",
            padding: "8px 20px",
            background: "var(--accent, #0066cc)",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            fontSize: 14,
            cursor: submitting ? "not-allowed" : "pointer",
          }}
        >
          {submitting ? "Submitting…" : "Submit Request"}
        </button>
      </form>

      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Past Requests</h2>
      {loadError && <p style={{ color: "#dc2626", fontSize: 14 }}>{loadError}</p>}
      {loaded && !loadError && requests.length === 0 && (
        <p style={{ color: "var(--text-secondary)" }}>No requests yet.</p>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {requests.map((r) => (
          <Link
            key={r.id}
            href={`/client/requests/${r.id}`}
            style={{
              display: "block",
              padding: 14,
              border: "1px solid var(--border)",
              borderRadius: 8,
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div style={{ fontWeight: 500 }}>{r.title}</div>
            <div
              style={{
                fontSize: 12,
                color: "var(--text-secondary)",
                marginTop: 4,
                display: "flex",
                gap: 16,
              }}
            >
              <span>{r.status}</span>
              <span>{new Date(r.createdAt).toLocaleDateString()}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
