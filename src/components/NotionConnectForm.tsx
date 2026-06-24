"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { postAction } from "@/components/ActionButton";
import { Button } from "@/components/ui/Button";

const labelStyle: React.CSSProperties = {
  fontSize: "var(--text-xs)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: "var(--color-text-tertiary, var(--text-secondary))",
  fontWeight: 700,
  display: "block",
  marginBottom: 4,
};
const input: React.CSSProperties = {
  border: "1px solid var(--color-border, var(--border))",
  borderRadius: 8,
  padding: "9px 11px",
  font: "inherit",
  fontSize: 13,
  background: "var(--color-surface, #fff)",
  width: "100%",
  boxSizing: "border-box",
};

type Summary = {
  projects?: { statusProperty: string; options: string[]; mapped: string[]; unmapped: string[] };
  tasks?: { statusProperty: string; options: string[]; mapped: string[]; unmapped: string[] };
};

export type NotionConnectState = {
  connected: boolean;
  projectsDatabaseId: string | null;
  tasksDatabaseId: string | null;
  statusProperty: string | null;
  lastSyncedAt: string | null;
  lastSyncSummary: Record<string, number> | null;
};

export function NotionConnectForm({
  orgId,
  orgSlug,
  state,
}: {
  orgId: string;
  orgSlug: string;
  state: NotionConnectState;
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [projectsDatabase, setProjectsDatabase] = useState(state.projectsDatabaseId ?? "");
  const [tasksDatabase, setTasksDatabase] = useState(state.tasksDatabaseId ?? "");
  const [statusProperty, setStatusProperty] = useState(state.statusProperty ?? "Status");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  const orgRef = { orgId, orgSlug };

  async function connect() {
    setError(null);
    if (!token.trim() && !state.connected) {
      setError("Paste your Notion integration token.");
      return;
    }
    if (!projectsDatabase.trim() && !tasksDatabase.trim()) {
      setError("Add a Projects and/or Tasks database link.");
      return;
    }
    setLoading("connect");
    const res = await postAction("/api/notion/connect", {
      ...orgRef,
      token: token.trim() || undefined,
      projectsDatabase: projectsDatabase.trim() || undefined,
      tasksDatabase: tasksDatabase.trim() || undefined,
      statusProperty: statusProperty.trim() || undefined,
    });
    setLoading(null);
    if (!res.ok) {
      setError(res.error ?? "Connect failed");
      return;
    }
    setSummary((res.result as Summary) ?? null);
    setToken("");
    router.refresh();
  }

  async function syncNow() {
    setError(null);
    setLoading("sync");
    const res = await postAction("/api/notion/sync", orgRef);
    setLoading(null);
    if (!res.ok) {
      setError(res.error ?? "Sync failed");
      return;
    }
    router.refresh();
  }

  async function disconnect() {
    if (!window.confirm("Disconnect Notion for this client? Linked items keep their link but stop syncing.")) return;
    setError(null);
    setLoading("disconnect");
    const res = await postAction("/api/notion/disconnect", orgRef);
    setLoading(null);
    if (!res.ok) {
      setError(res.error ?? "Disconnect failed");
      return;
    }
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {state.connected && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          ✓ Connected.
          {state.lastSyncedAt ? ` Last synced ${new Date(state.lastSyncedAt).toLocaleString()}.` : " Not synced yet."}
          {state.lastSyncSummary && (
            <span>
              {" "}
              (imported {state.lastSyncSummary.imported ?? 0}, updated {state.lastSyncSummary.updated ?? 0}, pushed{" "}
              {state.lastSyncSummary.pushed ?? 0})
            </span>
          )}
        </div>
      )}

      <div>
        <label style={labelStyle}>Notion integration token {state.connected && "(leave blank to keep current)"}</label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="secret_… or ntn_…"
          style={input}
          autoComplete="off"
        />
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
          In Notion: Settings → Connections → develop your own integration → copy the Internal Integration Secret, then
          share your database(s) with it.
        </div>
      </div>

      <div>
        <label style={labelStyle}>Projects database link</label>
        <input value={projectsDatabase} onChange={(e) => setProjectsDatabase(e.target.value)} placeholder="https://notion.so/…  (optional)" style={input} />
      </div>
      <div>
        <label style={labelStyle}>Tasks database link</label>
        <input value={tasksDatabase} onChange={(e) => setTasksDatabase(e.target.value)} placeholder="https://notion.so/…  (optional)" style={input} />
      </div>
      <div style={{ maxWidth: 220 }}>
        <label style={labelStyle}>Status property name</label>
        <input value={statusProperty} onChange={(e) => setStatusProperty(e.target.value)} placeholder="Status" style={input} />
      </div>

      {error && <div style={{ fontSize: 13, color: "var(--color-danger, #c0392b)" }}>{error}</div>}

      {summary && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", background: "var(--color-surface-2, #f6f6f7)", padding: 10, borderRadius: 8 }}>
          {summary.projects && (
            <div>
              Projects status “{summary.projects.statusProperty}” → mapped {summary.projects.mapped.join(", ") || "none"}
              {summary.projects.unmapped.length > 0 && ` · unmapped: ${summary.projects.unmapped.join(", ")}`}
            </div>
          )}
          {summary.tasks && (
            <div>
              Tasks status “{summary.tasks.statusProperty}” → mapped {summary.tasks.mapped.join(", ") || "none"}
              {summary.tasks.unmapped.length > 0 && ` · unmapped: ${summary.tasks.unmapped.join(", ")}`}
            </div>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button onClick={connect} loading={loading === "connect"} disabled={!!loading}>
          {state.connected ? "Update connection" : "Connect Notion"}
        </Button>
        {state.connected && (
          <>
            <Button variant="secondary" onClick={syncNow} loading={loading === "sync"} disabled={!!loading}>
              Sync now
            </Button>
            <Button variant="ghost" onClick={disconnect} loading={loading === "disconnect"} disabled={!!loading}>
              Disconnect
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
