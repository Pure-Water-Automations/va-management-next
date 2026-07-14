"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Badge } from "@/components/ui/Badge";

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

type BadgeVariant = "default" | "sky" | "success" | "warning" | "danger";

function statusMeta(s: string): { variant: BadgeVariant; label: string } {
  switch (s) {
    case "RECEIVED":
      return { variant: "sky", label: "New" };
    case "TRIAGE_NEEDED":
      return { variant: "warning", label: "Needs triage" };
    case "READY_TO_ASSIGN":
      return { variant: "default", label: "Ready to assign" };
    case "ASSIGNED":
      return { variant: "success", label: "Assigned" };
    case "DECLINED":
      return { variant: "danger", label: "Declined" };
    default:
      return { variant: "default", label: s.replace(/_/g, " ") };
  }
}

function priorityChip(p: string) {
  const map: Record<string, { c: string; bg: string }> = {
    High: { c: "var(--color-error-dark)", bg: "var(--color-error-light)" },
    Medium: { c: "var(--color-warning-dark)", bg: "var(--color-warning-light)" },
    Low: { c: "var(--color-text-tertiary)", bg: "var(--color-bg-tertiary)" },
  };
  const m = map[p] ?? map.Low;
  return (
    <span
      style={{
        fontSize: "var(--text-2xs)",
        fontWeight: 700,
        letterSpacing: ".03em",
        textTransform: "uppercase",
        color: m.c,
        background: m.bg,
        padding: "3px 8px",
        borderRadius: 999,
      }}
    >
      {p}
    </span>
  );
}

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

  if (loading) return <p style={{ padding: 32, color: "var(--color-text-secondary)" }}>Loading…</p>;
  if (error) return <p style={{ padding: 32, color: "var(--color-error)" }}>{error}</p>;
  if (!request) return <p style={{ padding: 32 }}>Not found.</p>;

  const meta = statusMeta(request.status);
  const isTriage = request.status === "RECEIVED" || request.status === "TRIAGE_NEEDED";

  return (
    <div className="dash-stage">
      <div className="page-head">
        <div>
          <div className="crumb">
            <Link href="/hr/requests">Client requests</Link> / {request.title}
          </div>
          <h1>{request.title}</h1>
        </div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 4 }}>
        {/* Details card */}
        <div className="surface" style={card}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 9,
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <span
              style={{
                fontSize: "var(--text-2xs)",
                fontWeight: 700,
                letterSpacing: ".05em",
                textTransform: "uppercase",
                color: "var(--color-sky-700)",
              }}
            >
              {request.clientOrganization.name}
            </span>
            {priorityChip(request.priorityPreference)}
            <Badge variant={meta.variant} size="sm">
              {meta.label}
            </Badge>
          </div>

          <dl style={dlGrid}>
            <dt style={dtStyle}>Submitted by</dt>
            <dd style={ddStyle}>{request.submittedBy.name ?? request.submittedBy.email}</dd>

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
                <dd style={{ ...ddStyle, color: "var(--color-error-dark)" }}>
                  {request.declineReason}
                </dd>
              </>
            )}

            {request.assignedTask && (
              <>
                <dt style={dtStyle}>Linked task</dt>
                <dd style={ddStyle}>
                  <a
                    href={`/hr/tasks/${request.assignedTask.id}`}
                    style={{ color: "var(--color-navy-500)", fontWeight: 600 }}
                  >
                    {request.assignedTask.title}
                  </a>{" "}
                  <span style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-xs)" }}>
                    ({request.assignedTask.status})
                  </span>
                </dd>
              </>
            )}
          </dl>

          <div style={{ marginTop: 20 }}>
            <div style={sectionLabel}>Description</div>
            <p
              style={{
                marginTop: 8,
                whiteSpace: "pre-wrap",
                fontSize: "var(--text-sm)",
                color: "var(--color-text-secondary)",
                lineHeight: 1.55,
              }}
            >
              {request.description}
            </p>
          </div>
        </div>

        {/* Triage actions (RECEIVED / TRIAGE_NEEDED) */}
        {isTriage && (
          <div className="surface" style={card}>
            <h2 style={cardTitle}>Triage actions</h2>

            {actionError && (
              <p style={{ color: "var(--color-error-dark)", marginBottom: 16, fontSize: "var(--text-sm)" }}>
                {actionError}
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
              {/* Accept */}
              <div>
                <h3 style={actionHead}>Accept</h3>
                <p style={helpText}>
                  Mark this request as accepted. You can link a task afterwards.
                </p>
                <button
                  style={navyBtn(busy)}
                  disabled={busy}
                  onClick={() => doAction("accept")}
                  onMouseEnter={(e) => {
                    if (!busy) e.currentTarget.style.transform = "translateY(-1px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "";
                  }}
                >
                  Accept request
                </button>
              </div>

              <hr style={{ border: "none", borderTop: "1px solid var(--color-border-subtle)", margin: 0 }} />

              {/* Decline */}
              <div>
                <h3 style={actionHead}>Decline</h3>
                <p style={helpText}>Decline this request. A reason is required.</p>
                <textarea
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  placeholder="Reason for declining…"
                  rows={3}
                  maxLength={500}
                  style={textarea}
                />
                <button
                  style={{ ...dangerBtn(busy || declineReason.trim().length === 0), marginTop: 8 }}
                  disabled={busy || declineReason.trim().length === 0}
                  onClick={() => doAction("decline", { reason: declineReason })}
                >
                  Decline request
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Link task (READY_TO_ASSIGN) */}
        {request.status === "READY_TO_ASSIGN" && (
          <div className="surface" style={card}>
            <h2 style={cardTitle}>Link to task</h2>
            <p style={{ ...helpText, marginBottom: 12 }}>
              Enter the ID of an existing task to link to this request. Status will move to Assigned.
            </p>

            {actionError && (
              <p style={{ color: "var(--color-error-dark)", marginBottom: 12, fontSize: "var(--text-sm)" }}>
                {actionError}
              </p>
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
                style={navyBtn(busy || assignTaskId.trim().length === 0)}
                disabled={busy || assignTaskId.trim().length === 0}
                onClick={() => doAction("assign", { taskId: assignTaskId.trim() })}
              >
                Link task
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const card: React.CSSProperties = {
  padding: "22px 24px",
  borderRadius: "var(--radius-lg)",
};

const cardTitle: React.CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--text-xl)",
  fontWeight: 600,
  margin: "0 0 16px",
  color: "var(--color-text-primary)",
  letterSpacing: "-.01em",
};

const sectionLabel: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  fontWeight: 700,
  letterSpacing: ".06em",
  textTransform: "uppercase",
  color: "var(--color-text-tertiary)",
};

const actionHead: React.CSSProperties = {
  fontSize: "var(--text-base)",
  fontWeight: 600,
  margin: "0 0 4px",
  color: "var(--color-text-primary)",
};

const helpText: React.CSSProperties = {
  fontSize: "var(--text-sm)",
  color: "var(--color-text-secondary)",
  margin: "0 0 8px",
};

const dlGrid: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "160px 1fr",
  gap: "10px 16px",
  margin: 0,
};

const dtStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "var(--text-sm)",
  color: "var(--color-text-tertiary)",
  paddingTop: 2,
};

const ddStyle: React.CSSProperties = {
  margin: 0,
  fontSize: "var(--text-sm)",
  color: "var(--color-text-primary)",
};

const textarea: React.CSSProperties = {
  width: "100%",
  padding: "9px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--text-sm)",
  resize: "vertical",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  boxSizing: "border-box",
  font: "inherit",
};

const inputStyle: React.CSSProperties = {
  padding: "9px 12px",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-md)",
  fontSize: "var(--text-sm)",
  background: "var(--color-surface)",
  color: "var(--color-text-primary)",
  font: "inherit",
};

const baseBtn: React.CSSProperties = {
  appearance: "none",
  font: "inherit",
  fontWeight: 600,
  fontSize: "var(--text-sm)",
  padding: "0 16px",
  height: 38,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  transition: "transform .16s",
};

function navyBtn(disabled: boolean): React.CSSProperties {
  return {
    ...baseBtn,
    color: "#fff",
    background: "var(--color-navy-900)",
    border: "none",
    boxShadow: disabled ? "none" : "var(--shadow-navy-sm)",
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "default" : "pointer",
  };
}

function dangerBtn(disabled: boolean): React.CSSProperties {
  return {
    ...baseBtn,
    color: "#fff",
    background: "var(--color-error)",
    border: "none",
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? "default" : "pointer",
  };
}
