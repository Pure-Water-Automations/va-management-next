"use client";

import { useEffect, useState } from "react";
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
  returnPath,
  oauthConfigured,
  needsPick,
  state,
}: {
  orgId: string;
  orgSlug: string;
  returnPath: string;
  oauthConfigured: boolean;
  needsPick: boolean;
  state: NotionConnectState;
}) {
  // Post-OAuth: token is stored but no databases picked yet → show the picker.
  if (needsPick) {
    return <NotionDatabasePicker orgId={orgId} orgSlug={orgSlug} returnPath={returnPath} />;
  }
  return (
    <ConnectMain orgId={orgId} orgSlug={orgSlug} returnPath={returnPath} oauthConfigured={oauthConfigured} state={state} />
  );
}

const orgRefOf = (orgId: string, orgSlug: string) => ({ orgId, orgSlug });

// ── Main connect / status view ───────────────────────────────────────────────

function ConnectMain({
  orgId,
  orgSlug,
  returnPath,
  oauthConfigured,
  state,
}: {
  orgId: string;
  orgSlug: string;
  returnPath: string;
  oauthConfigured: boolean;
  state: NotionConnectState;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const orgRef = orgRefOf(orgId, orgSlug);
  const startUrl = `/api/notion/oauth/start?org=${encodeURIComponent(orgId)}&return=${encodeURIComponent(returnPath)}`;

  // Surface an OAuth error bounced back via ?notion=error.
  useEffect(() => {
    const flag = new URLSearchParams(window.location.search).get("notion");
    if (flag === "error") setError("Notion connection failed or was cancelled. Please try again.");
  }, []);

  async function syncNow() {
    setError(null);
    setLoading("sync");
    const res = await postAction("/api/notion/sync", orgRef);
    setLoading(null);
    if (!res.ok) return setError(res.error ?? "Sync failed");
    router.refresh();
  }
  async function disconnect() {
    if (!window.confirm("Disconnect Notion for this client? Linked items keep their link but stop syncing.")) return;
    setError(null);
    setLoading("disconnect");
    const res = await postAction("/api/notion/disconnect", orgRef);
    setLoading(null);
    if (!res.ok) return setError(res.error ?? "Disconnect failed");
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

      {error && <div style={{ fontSize: 13, color: "var(--color-danger, #c0392b)" }}>{error}</div>}

      {/* Primary path: one-click OAuth */}
      {oauthConfigured && !state.connected && (
        <>
          <Button href={startUrl}>Connect with Notion</Button>
          <div style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            Pick your workspace and choose which pages to share in Notion&apos;s own screen — no token to copy.
          </div>
          <details>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              Or paste an integration token manually
            </summary>
            <div style={{ marginTop: 12 }}>
              <ManualConnect orgRef={orgRef} state={state} onDone={() => router.refresh()} />
            </div>
          </details>
        </>
      )}

      {/* No OAuth app configured → manual is the only path */}
      {!oauthConfigured && !state.connected && (
        <ManualConnect orgRef={orgRef} state={state} onDone={() => router.refresh()} />
      )}

      {/* Connected → status + actions (+ manual re-config, + reconnect via OAuth) */}
      {state.connected && (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button variant="secondary" onClick={syncNow} loading={loading === "sync"} disabled={!!loading}>
              Sync now
            </Button>
            {oauthConfigured && (
              <Button variant="ghost" href={startUrl}>
                Reconnect workspace
              </Button>
            )}
            <Button variant="ghost" onClick={disconnect} loading={loading === "disconnect"} disabled={!!loading}>
              Disconnect
            </Button>
          </div>
          <details>
            <summary style={{ cursor: "pointer", fontSize: 12, color: "var(--text-secondary)", fontWeight: 600 }}>
              Update databases / token manually
            </summary>
            <div style={{ marginTop: 12 }}>
              <ManualConnect orgRef={orgRef} state={state} onDone={() => router.refresh()} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

// ── Post-OAuth database picker ────────────────────────────────────────────────

function NotionDatabasePicker({ orgId, orgSlug, returnPath }: { orgId: string; orgSlug: string; returnPath: string }) {
  const router = useRouter();
  const [databases, setDatabases] = useState<{ id: string; title: string }[] | null>(null);
  const [projects, setProjects] = useState("");
  const [tasks, setTasks] = useState("");
  const [statusProperty, setStatusProperty] = useState("Status");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const startUrl = `/api/notion/oauth/start?org=${encodeURIComponent(orgId)}&return=${encodeURIComponent(returnPath)}`;

  useEffect(() => {
    fetch(`/api/notion/databases?org=${encodeURIComponent(orgId)}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.ok) return setError(d.error ?? "Couldn't list your Notion databases");
        setDatabases(d.result.databases ?? []);
        setProjects(d.result.suggestedProjects ?? "");
        setTasks(d.result.suggestedTasks ?? "");
      })
      .catch(() => setError("Couldn't reach Notion. Try again."));
  }, [orgId]);

  async function finish() {
    setError(null);
    if (!projects && !tasks) return setError("Choose a Projects and/or Tasks database.");
    setLoading(true);
    const res = await postAction("/api/notion/connect", {
      orgId,
      orgSlug,
      projectsDatabase: projects || undefined,
      tasksDatabase: tasks || undefined,
      statusProperty: statusProperty.trim() || undefined,
    });
    setLoading(false);
    if (!res.ok) return setError(res.error ?? "Couldn't finish connecting");
    router.refresh();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        ✓ Connected to Notion. Now choose which databases to sync — we&apos;ve pre-selected our best guess.
      </div>
      {error && <div style={{ fontSize: 13, color: "var(--color-danger, #c0392b)" }}>{error}</div>}
      {!databases && !error && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>Loading your databases…</div>}
      {databases && databases.length === 0 && (
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>
          No databases were shared with the integration. In Notion&apos;s connect screen, grant access to your
          Projects/Tasks pages, then{" "}
          <a href={startUrl} style={{ fontWeight: 600 }}>
            reconnect
          </a>
          .
        </div>
      )}
      {databases && databases.length > 0 && (
        <>
          <div>
            <label style={labelStyle}>Projects database</label>
            <select value={projects} onChange={(e) => setProjects(e.target.value)} style={input}>
              <option value="">— none —</option>
              {databases.map((d) => (
                <option key={d.id} value={d.id} disabled={d.id === tasks}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label style={labelStyle}>Tasks database</label>
            <select value={tasks} onChange={(e) => setTasks(e.target.value)} style={input}>
              <option value="">— none —</option>
              {databases.map((d) => (
                <option key={d.id} value={d.id} disabled={d.id === projects}>
                  {d.title}
                </option>
              ))}
            </select>
          </div>
          <div style={{ maxWidth: 220 }}>
            <label style={labelStyle}>Status property name</label>
            <input value={statusProperty} onChange={(e) => setStatusProperty(e.target.value)} placeholder="Status" style={input} />
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <Button onClick={finish} loading={loading} disabled={loading}>
              Finish connecting
            </Button>
            <Button variant="ghost" href={startUrl}>
              Use a different workspace
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Manual internal-integration-token form (fallback) ────────────────────────

function ManualConnect({
  orgRef,
  state,
  onDone,
}: {
  orgRef: { orgId: string; orgSlug: string };
  state: NotionConnectState;
  onDone: () => void;
}) {
  const [token, setToken] = useState("");
  const [projectsDatabase, setProjectsDatabase] = useState(state.projectsDatabaseId ?? "");
  const [tasksDatabase, setTasksDatabase] = useState(state.tasksDatabaseId ?? "");
  const [statusProperty, setStatusProperty] = useState(state.statusProperty ?? "Status");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function connect() {
    setError(null);
    if (!token.trim() && !state.connected) return setError("Paste your Notion integration token.");
    if (!projectsDatabase.trim() && !tasksDatabase.trim()) return setError("Add a Projects and/or Tasks database link.");
    setLoading(true);
    const res = await postAction("/api/notion/connect", {
      ...orgRef,
      token: token.trim() || undefined,
      projectsDatabase: projectsDatabase.trim() || undefined,
      tasksDatabase: tasksDatabase.trim() || undefined,
      statusProperty: statusProperty.trim() || undefined,
    });
    setLoading(false);
    if (!res.ok) return setError(res.error ?? "Connect failed");
    setSummary((res.result as Summary) ?? null);
    setToken("");
    onDone();
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <label style={labelStyle}>Notion integration token {state.connected && "(leave blank to keep current)"}</label>
        <input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder="secret_… or ntn_…" style={input} autoComplete="off" />
        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 4 }}>
          Get it at{" "}
          <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" style={{ color: "var(--color-sky-600, #1f7fc4)", fontWeight: 600 }}>
            notion.so/my-integrations
          </a>{" "}
          → New integration → copy the Internal Integration Secret, then share your database(s) with it.
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
      <div>
        <Button onClick={connect} loading={loading} disabled={loading}>
          {state.connected ? "Update connection" : "Connect Notion"}
        </Button>
      </div>
    </div>
  );
}
