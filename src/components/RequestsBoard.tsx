"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Stat } from "@/components/ui/Stat";
import { Badge } from "@/components/ui/Badge";

type Status =
  | "RECEIVED"
  | "TRIAGE_NEEDED"
  | "READY_TO_ASSIGN"
  | "ASSIGNED"
  | "DECLINED";

export type RequestRow = {
  id: string;
  title: string;
  description: string | null;
  priorityPreference: string;
  dueDatePreference: string | null;
  createdAt: string;
  status: Status;
  declineReason: string | null;
  submittedBy: { name: string | null; email: string };
  clientOrganization: { name: string };
  assignedTask: { id: string; title: string; status: string } | null;
};

type FilterKey = "triage" | "ready" | "assigned" | "declined" | "all";

const TRIAGE: Status[] = ["RECEIVED", "TRIAGE_NEEDED"];

function relAge(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
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

function statusBadge(s: Status) {
  switch (s) {
    case "RECEIVED":
      return <Badge variant="sky" size="sm">New</Badge>;
    case "TRIAGE_NEEDED":
      return <Badge variant="warning" size="sm">Needs triage</Badge>;
    case "READY_TO_ASSIGN":
      return <Badge variant="default" size="sm">Ready to assign</Badge>;
    case "ASSIGNED":
      return <Badge variant="success" size="sm">Assigned</Badge>;
    case "DECLINED":
      return <Badge variant="default" size="sm">Declined</Badge>;
    default:
      return <Badge variant="default" size="sm">{s}</Badge>;
  }
}

const btnBase: React.CSSProperties = {
  appearance: "none",
  cursor: "pointer",
  font: "inherit",
  fontWeight: 600,
  fontSize: "var(--text-sm)",
  padding: "0 14px",
  height: 34,
  borderRadius: 999,
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  flexShrink: 0,
  whiteSpace: "nowrap",
  transition: "transform .16s",
};

export default function RequestsBoard({ requests }: { requests: RequestRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<FilterKey>("triage");
  const [declineFor, setDeclineFor] = useState<string | null>(null);
  const [declineText, setDeclineText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function fireToast(msg: string) {
    setToast(msg);
    window.clearTimeout((fireToast as { _t?: number })._t);
    (fireToast as { _t?: number })._t = window.setTimeout(() => setToast(null), 2400);
  }

  const count = (set: Status[]) => requests.filter((r) => set.includes(r.status)).length;
  const kpi = {
    triage: count(TRIAGE),
    ready: count(["READY_TO_ASSIGN"]),
    assigned: count(["ASSIGNED"]),
    declined: count(["DECLINED"]),
  };

  const filterDefs: { key: FilterKey; label: string; count: number }[] = [
    { key: "triage", label: "Needs triage", count: kpi.triage },
    { key: "ready", label: "Ready to assign", count: kpi.ready },
    { key: "assigned", label: "Assigned", count: kpi.assigned },
    { key: "declined", label: "Declined", count: kpi.declined },
    { key: "all", label: "All", count: requests.length },
  ];

  const match = (r: RequestRow) => {
    switch (filter) {
      case "all":
        return true;
      case "triage":
        return TRIAGE.includes(r.status);
      case "ready":
        return r.status === "READY_TO_ASSIGN";
      case "assigned":
        return r.status === "ASSIGNED";
      case "declined":
        return r.status === "DECLINED";
    }
  };

  const visible = requests.filter(match);

  async function accept(id: string) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/hr/requests/${id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        fireToast(data.error ?? "Couldn't accept request");
      } else {
        fireToast("Request accepted — ready to assign");
        router.refresh();
      }
    } catch {
      fireToast("Network error");
    } finally {
      setBusyId(null);
    }
  }

  async function decline(id: string) {
    const reason = declineText.trim();
    if (!reason) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/hr/requests/${id}/decline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        fireToast(data.error ?? "Couldn't decline request");
      } else {
        setDeclineFor(null);
        setDeclineText("");
        fireToast("Request declined");
        router.refresh();
      }
    } catch {
      fireToast("Network error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      {/* KPI row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(168px, 1fr))",
          gap: 14,
          marginBottom: 22,
        }}
      >
        <Stat label="To triage" value={kpi.triage} variant="navy" />
        <Stat label="Ready to assign" value={kpi.ready} />
        <Stat label="Assigned" value={kpi.assigned} variant="sky" />
        <Stat label="Declined" value={kpi.declined} />
      </div>

      {/* Filter chips */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          flexWrap: "wrap",
          marginBottom: 18,
        }}
      >
        {filterDefs.map((f) => {
          const on = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                appearance: "none",
                cursor: "pointer",
                font: "inherit",
                fontSize: "var(--text-sm)",
                fontWeight: 600,
                padding: "7px 14px",
                borderRadius: 999,
                background: on ? "var(--color-navy-900)" : "var(--color-surface)",
                color: on ? "#fff" : "var(--color-text-secondary)",
                border: `1px solid ${on ? "var(--color-navy-900)" : "var(--color-border)"}`,
                display: "inline-flex",
                alignItems: "center",
                gap: 7,
                transition: "all .15s",
              }}
            >
              {f.label}
              <span style={{ fontSize: "var(--text-2xs)", opacity: 0.7 }}>{f.count}</span>
            </button>
          );
        })}
      </div>

      {/* Request cards */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {visible.map((r) => {
          const isTriage = TRIAGE.includes(r.status);
          const declineOpen = declineFor === r.id;
          const busy = busyId === r.id;
          return (
            <div
              key={r.id}
              className="surface"
              style={{ padding: "18px 20px", borderRadius: "var(--radius-lg)" }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 9,
                      marginBottom: 6,
                      flexWrap: "wrap",
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
                      {r.clientOrganization.name}
                    </span>
                    {priorityChip(r.priorityPreference)}
                    {statusBadge(r.status)}
                  </div>
                  <div
                    style={{
                      fontSize: "var(--text-base)",
                      fontWeight: 600,
                      color: "var(--color-text-primary)",
                      marginBottom: 4,
                    }}
                  >
                    {r.title}
                  </div>
                  {r.description && (
                    <p
                      style={{
                        margin: 0,
                        fontSize: "var(--text-sm)",
                        color: "var(--color-text-secondary)",
                        lineHeight: 1.5,
                        maxWidth: "64ch",
                      }}
                    >
                      {r.description}
                    </p>
                  )}
                  <div
                    style={{
                      fontSize: "var(--text-2xs)",
                      color: "var(--color-text-tertiary)",
                      marginTop: 8,
                    }}
                  >
                    From {r.submittedBy.name ?? r.submittedBy.email} · {relAge(r.createdAt)}
                    {r.dueDatePreference
                      ? ` · needed by ${new Date(r.dueDatePreference).toLocaleDateString()}`
                      : ""}
                  </div>

                  {r.status === "DECLINED" && r.declineReason && (
                    <div
                      style={{
                        marginTop: 10,
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-tertiary)",
                        padding: "9px 12px",
                        background: "var(--color-bg-secondary)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      Declined — {r.declineReason}
                    </div>
                  )}

                  {declineOpen && (
                    <div
                      style={{
                        marginTop: 12,
                        padding: 12,
                        background: "var(--color-bg-secondary)",
                        borderRadius: "var(--radius-md)",
                      }}
                    >
                      <textarea
                        value={declineText}
                        onChange={(e) => setDeclineText(e.target.value)}
                        placeholder="Reason for declining…"
                        rows={2}
                        maxLength={500}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          resize: "vertical",
                          font: "inherit",
                          fontSize: "var(--text-sm)",
                          padding: "9px 11px",
                          border: "1px solid var(--color-border)",
                          borderRadius: "var(--radius-md)",
                          color: "var(--color-text-primary)",
                          background: "var(--color-surface)",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 9 }}>
                        <button
                          onClick={() => decline(r.id)}
                          disabled={busy || declineText.trim().length === 0}
                          style={{
                            ...btnBase,
                            color: "#fff",
                            background: "var(--color-error)",
                            border: "none",
                            opacity: busy || declineText.trim().length === 0 ? 0.45 : 1,
                            cursor:
                              busy || declineText.trim().length === 0 ? "default" : "pointer",
                          }}
                        >
                          Decline request
                        </button>
                        <button
                          onClick={() => {
                            setDeclineFor(null);
                            setDeclineText("");
                          }}
                          style={{
                            ...btnBase,
                            color: "var(--color-text-secondary)",
                            background: "var(--color-surface)",
                            border: "1px solid var(--color-border)",
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action area (right) */}
                <div style={{ flex: "none" }}>
                  {isTriage && (
                    <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                      <button
                        onClick={() => accept(r.id)}
                        disabled={busy}
                        style={{
                          ...btnBase,
                          color: "#fff",
                          background: "var(--color-navy-900)",
                          border: "none",
                          boxShadow: "var(--shadow-navy-sm)",
                          opacity: busy ? 0.6 : 1,
                          cursor: busy ? "default" : "pointer",
                        }}
                        onMouseEnter={(e) => {
                          if (!busy) e.currentTarget.style.transform = "translateY(-1px)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "";
                        }}
                      >
                        <svg
                          width={14}
                          height={14}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={3}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Accept
                      </button>
                      <button
                        onClick={() => {
                          setDeclineFor(declineOpen ? null : r.id);
                          setDeclineText("");
                        }}
                        style={{
                          ...btnBase,
                          color: "var(--color-text-secondary)",
                          background: "var(--color-surface)",
                          border: "1px solid var(--color-border)",
                        }}
                      >
                        Decline
                      </button>
                    </div>
                  )}

                  {r.status === "READY_TO_ASSIGN" && (
                    <a
                      href={`/hr/requests/${r.id}`}
                      style={{
                        ...btnBase,
                        textDecoration: "none",
                        color: "#fff",
                        background: "var(--color-navy-900)",
                        border: "none",
                        boxShadow: "var(--shadow-navy-sm)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.transform = "translateY(-1px)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.transform = "";
                      }}
                    >
                      <svg
                        width={15}
                        height={15}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2.2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                        <circle cx="9" cy="7" r="4" />
                        <line x1="19" y1="8" x2="19" y2="14" />
                        <line x1="22" y1="11" x2="16" y2="11" />
                      </svg>
                      Assign
                    </a>
                  )}

                  {r.status === "ASSIGNED" && (
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 14px",
                        borderRadius: 999,
                        background: "var(--color-success-light)",
                        border: "1px solid var(--color-success)",
                        maxWidth: 260,
                      }}
                    >
                      <svg
                        width={15}
                        height={15}
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="var(--color-success-dark)"
                        strokeWidth={3}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        style={{ flexShrink: 0 }}
                      >
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span
                        style={{
                          fontSize: "var(--text-sm)",
                          fontWeight: 600,
                          color: "var(--color-success-dark)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Assigned · {r.assignedTask?.title ?? "task"}
                      </span>
                    </div>
                  )}

                  {r.status === "DECLINED" && (
                    <span
                      style={{
                        fontSize: "var(--text-xs)",
                        color: "var(--color-text-tertiary)",
                        fontWeight: 600,
                      }}
                    >
                      Closed
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {visible.length === 0 && (
          <div
            style={{
              textAlign: "center",
              padding: 44,
              background: "var(--color-surface)",
              border: "1px solid var(--color-border-subtle)",
              borderRadius: "var(--radius-lg)",
              color: "var(--color-text-tertiary)",
              fontSize: "var(--text-sm)",
            }}
          >
            Nothing here — inbox zero for this filter.
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            left: "50%",
            bottom: 28,
            transform: "translateX(-50%)",
            zIndex: 90,
            background: "var(--color-navy-900)",
            color: "#fff",
            fontSize: "var(--text-sm)",
            fontWeight: 600,
            padding: "11px 20px",
            borderRadius: 999,
            boxShadow: "var(--shadow-lg)",
            animation: "pwa-fade-in .2s ease both",
          }}
        >
          {toast}
        </div>
      )}
    </>
  );
}
