"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

type Request = {
  id: string;
  title: string;
  description: string;
  status: string;
  priorityPreference: string;
  dueDatePreference: string | null;
  fileReference: string | null;
  declineReason: string | null;
  createdAt: string;
  submittedBy: { name: string | null; email: string };
  clientOrganization: { name: string };
  assignedTask: { id: string; title: string; status: string } | null;
};

export default function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [request, setRequest] = useState<Request | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [declineReason, setDeclineReason] = useState("");
  const [assignTaskId, setAssignTaskId] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/hr/requests/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setRequest(d.request);
      })
      .catch(() => setError("Failed to load request"))
      .finally(() => setLoading(false));
  }, [id]);

  async function doAction(path: string, body?: Record<string, string>) {
    setBusy(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/hr/requests/${id}/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body ?? {}),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setActionError(data.error ?? "Action failed");
      } else {
        router.push("/hr/requests");
      }
    } catch {
      setActionError("Network error");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p style={{ padding: 32 }}>Loading…</p>;
  if (error) return <p style={{ padding: 32, color: "var(--color-error)" }}>{error}</p>;
  if (!request) return <p style={{ padding: 32 }}>Not found.</p>;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">
            <a href="/hr/requests">Client Requests</a> / {request.title}
          </div>
          <h1>{request.title}</h1>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 24, marginTop: 24 }}>
        {/* Details */}
        <div style={card}>
          <h2 style={cardTitle}>Request details</h2>
          <dl style={dlGrid}>
            <dt style={dtStyle}>Client</dt>
            <dd style={ddStyle}>{request.clientOrganization.name}</dd>

            <dt style={dtStyle}>Submitted by</dt>
            <dd style={ddStyle}>{request.submittedBy.name ?? request.submittedBy.email}</dd>

            <dt style={dtStyle}>Status</dt>
            <dd style={ddStyle}>
              <span style={statusPill(request.status)}>{request.status.replace(/_/g, " ")}</span>
            </dd>

            <dt style={dtStyle}>Priority preference</dt>
            <dd style={ddStyle}>{request.priorityPreference}</dd>

            <dt style={dtStyle}>Due date preference</dt>
            <dd style={ddStyle}>
              {request.dueDatePreference
                ? new Date(request.dueDatePreference).toLocaleDateString()
                : "—"}
            </dd>

            <dt style={dtStyle}>Received</dt>
            <dd style={ddStyle}>{new Date(request.createdAt).toLocaleDateString()}</dd>

            {request.fileReference && (
              <>
                <dt style={dtStyle}>File reference</dt>
                <dd style={ddStyle}>{request.fileReference}</dd>
              </>
            )}

            {request.declineReason && (
              <>
                <dt style={dtStyle}>Decline reason</dt>
                <dd style={{ ...ddStyle, color: "var(--color-error)" }}>{request.declineReason}</dd>
              </>
            )}

            {request.assignedTask && (
              <>
                <dt style={dtStyle}>Linked task</dt>
                <dd style={ddStyle}>
                  <a href={`/hr/tasks/${request.assignedTask.id}`}>
                    {request.assignedTask.title}
                  </a>{" "}
                  <span className="small">({request.assignedTask.status})</span>
                </dd>
              </>
            )}
          </dl>

          <div style={{ marginTop: 20 }}>
            <div style={dtStyle}>Description</div>
            <p style={{ marginTop: 6, whiteSpace: "pre-wrap", fontSize: "var(--text-sm)" }}>
              {request.description}
            </p>
          </div>
        </div>

        {/* Actions (only for PENDING) */}
        {request.status === "PENDING" && (
          <div style={card}>
            <h2 style={cardTitle}>Triage actions</h2>

            {actionError && (
              <p style={{ color: "var(--color-error)", marginBottom: 16 }}>{actionError}</p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
              {/* Accept */}
              <div>
                <h3 style={actionHead}>Accept</h3>
                <p className="small" style={{ color: "var(--color-text-secondary)", marginBottom: 8 }}>
                  Mark this request as accepted. You can link a task afterwards.
                </p>
                <button
                  className="btn btn-primary"
                  disabled={busy}
                  onClick={() => doAction("accept")}
                >
                  Accept request
                </button>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--color-border-subtle)" }} />

              {/* Decline */}
              <div>
                <h3 style={actionHead}>Decline</h3>
                <p className="small" style={{ color: "var(--color-text-secondary)", marginBottom: 8 }}>
                  Decline this request. A reason is required.
                </p>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Reason for declining…"
                  rows={3}
                  maxLength={500}
                  style={textarea}
                />
                <button
                  className="btn btn-danger"
                  disabled={busy || declineReason.trim().length === 0}
                  onClick={() => doAction("decline", { reason: declineReason })}
                  style={{ marginTop: 8 }}
                >
                  Decline request
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Link task (only for ACCEPTED) */}
        {request.status === "ACCEPTED" && (
          <div style={card}>
            <h2 style={cardTitle}>Link to task</h2>
            <p className="small" style={{ color: "var(--color-text-secondary)", marginBottom: 12 }}>
              Enter the ID of an existing task to link to this request. Status will move to In Progress.
            </p>

            {actionError && (
              <p style={{ color: "var(--color-error)", marginBottom: 12 }}>{actionError}</p>
            )}

            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                type="text"
                value={assignTaskId}
                onChange={(e) => setAssignTaskId(e.target.value)}
                placeholder="Task ID"
                style={{ ...inputStyle, flex: 1 }}
              />
              <button
                className="btn btn-primary"
                disabled={busy || assignTaskId.trim().length === 0}
                onClick={() => doAction("assign", { taskId: assignTaskId.trim() })}
              >
                Link task
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const card: React.CSSProperties = {
  background: "var(--color-bg-primary)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-lg)",
  padding: 24,
};

const cardTitle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--text-xl)",
  fontWeight: 600,
  margin: "0 0 16px",
};

const actionHead: React.CSSProperties = {
  fontSize: "var(--text-base)",
  fontWeight: 600,
  margin: "0 0 4px",
};

const dlGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "160px 1fr",
  gap: "8px 16px",
  margin: 0,
};

const dtStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "var(--text-sm)",
  color: "var(--color-text-secondary)",
  paddingTop: 2,
};

const ddStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-sm)",
};

const textarea: React.CSSProperties = {
  width: "100%",
  padding: "8px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--text-sm)",
  resize: "vertical",
  background: "var(--color-bg-primary)",
  color: "var(--color-text-primary)",
  boxSizing: "border-box",
};

const inputStyle: React.CSSProperties = {
  padding: "8px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--text-sm)",
  background: "var(--color-bg-primary)",
  color: "var(--color-text-primary)",
};

function statusPill(s: string): React.CSSProperties {
  const bg =
    s === "PENDING"
      ? "var(--color-warning)"
      : s === "ACCEPTED"
        ? "var(--color-sky-500)"
        : s === "DECLINED"
          ? "var(--color-error)"
          : s === "IN_PROGRESS"
            ? "var(--color-success)"
            : "var(--color-text-tertiary)";
  return {
    display: "inline-block",
    padding: "2px 8px",
    borderRadius: 99,
    fontSize: "var(--text-xs)",
    fontWeight: 600,
    background: bg,
    color: "#fff",
  };
}
