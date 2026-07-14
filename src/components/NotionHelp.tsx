/**
 * Plain-language, step-by-step setup guide for the Notion two-way sync, written
 * for a non-technical client. Rendered on /client/settings (for clients) and on
 * the staff /hr/clients/[slug] Notion section (so staff can walk a client through
 * it). Server component — no interactivity, just designed instructional content.
 */

const card: React.CSSProperties = {
  background: "var(--color-surface, #fff)",
  border: "1px solid var(--color-border-subtle, var(--border))",
  borderRadius: "var(--radius-lg, 12px)",
  padding: "18px 20px",
};
const stepNum: React.CSSProperties = {
  flex: "none",
  width: 26,
  height: 26,
  borderRadius: "50%",
  background: "var(--color-sky-500, #2b8fd6)",
  color: "#fff",
  fontSize: 13,
  fontWeight: 700,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const stepText: React.CSSProperties = {
  fontSize: "var(--text-sm, 14px)",
  color: "var(--color-text-secondary, #475467)",
  lineHeight: 1.55,
  margin: 0,
};
const linkStyle: React.CSSProperties = { color: "var(--color-sky-600, #1f7fc4)", fontWeight: 600 };

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span style={stepNum}>{n}</span>
      <p style={stepText}>{children}</p>
    </div>
  );
}

export function NotionHelp({ audience = "client", oauth = false }: { audience?: "client" | "staff"; oauth?: boolean }) {
  const you = audience === "staff" ? "the client" : "you";
  const your = audience === "staff" ? "their" : "your";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {oauth && (
        <div
          style={{
            borderRadius: "var(--radius-md, 10px)",
            padding: "14px 16px",
            background: "var(--color-surface-2, #f6f8fb)",
            border: "1px solid var(--color-border-subtle, #e6e8ee)",
            fontSize: "var(--text-sm, 14px)",
            color: "var(--color-text-secondary, #475467)",
            lineHeight: 1.6,
          }}
        >
          <strong>Easiest — one click:</strong> press <strong>Connect with Notion</strong> below, choose {your}{" "}
          workspace, and pick which pages to share in Notion&apos;s own screen. Then select {your} Projects/Tasks
          database and you&apos;re done — no token to copy, nothing to share manually. The token steps further down are
          only if {you} prefer to connect with an integration token instead.
        </div>
      )}

      {/* What it does + what syncs */}
      <div
        style={{
          borderRadius: "var(--radius-md, 10px)",
          padding: "16px 18px",
          background: "linear-gradient(135deg, var(--color-sky-50, #eef6fd), #eef0fa)",
          border: "1px solid var(--color-sky-100, #d6e8f7)",
        }}
      >
        <div style={{ fontSize: "var(--text-xs, 12px)", fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-sky-700, #1a6aa8)", marginBottom: 8 }}>
          What stays in sync
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--text-sm, 14px)", color: "var(--color-text-secondary, #475467)", lineHeight: 1.7 }}>
          <li>
            <strong>Status syncs both ways</strong> — change a task or project to <em>In&nbsp;progress</em> or{" "}
            <em>Done</em> in Notion or here, and the other side updates automatically.
          </li>
          <li>
            Each linked item gets a <strong>link to its Notion page</strong> in its description, so {your} full Notion
            record (notes, dates, custom fields) is always one click away.
          </li>
          <li>
            <strong>Everything other than status stays in Notion</strong> — we don&apos;t copy or change {your} other
            Notion properties.
          </li>
          <li>
            New pages in {your} connected database show up here automatically (tagged as Notion items). {you === "the client" ? "You" : "They"} can
            still add work here <em>without</em> Notion — both kinds live side by side.
          </li>
        </ul>
      </div>

      {/* 4-step setup */}
      <div style={card}>
        <div style={{ fontSize: "var(--text-base, 15px)", fontWeight: 700, color: "var(--color-navy-900, #1a2b4a)", marginBottom: 14 }}>
          Connect in 4 steps
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <Step n={1}>
            <strong>Create a Notion integration.</strong> In Notion go to{" "}
            <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" style={linkStyle}>
              notion.so/my-integrations
            </a>{" "}
            (or <strong>Settings → Connections → Develop or manage integrations</strong>) → <strong>New integration</strong> →
            give it a name like &ldquo;Pure&nbsp;Water&nbsp;VA&rdquo; → <strong>Save</strong>, then copy its{" "}
            <strong>Internal Integration Secret</strong> (starts with <code>secret_</code> or <code>ntn_</code>).
          </Step>
          <Step n={2}>
            <strong>Share {your} database(s) with it.</strong> Open {your} Projects database (and/or Tasks database) in
            Notion → the <strong>•••</strong> menu top-right → <strong>Connections</strong> → <strong>Add connections</strong> →
            choose the integration you just created. Repeat for each database you want to sync.
          </Step>
          <Step n={3}>
            <strong>Copy each database link.</strong> Still in Notion, use the database&apos;s <strong>•••</strong> menu →{" "}
            <strong>Copy link</strong> (or just copy the URL from {your} browser&apos;s address bar) for the Projects
            database and the Tasks database.
          </Step>
          <Step n={4}>
            <strong>Paste them below and connect.</strong> Drop in the integration secret and the database link(s),
            check that <strong>Status property name</strong> matches what {your} Notion calls it (usually just{" "}
            <em>Status</em>), then click <strong>Connect Notion</strong>. We&apos;ll read {your} statuses and show you
            exactly how they mapped.
          </Step>
        </div>
      </div>

      {/* After connecting */}
      <div style={card}>
        <div style={{ fontSize: "var(--text-base, 15px)", fontWeight: 700, color: "var(--color-navy-900, #1a2b4a)", marginBottom: 10 }}>
          After connecting
        </div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: "var(--text-sm, 14px)", color: "var(--color-text-secondary, #475467)", lineHeight: 1.7 }}>
          <li>It syncs automatically about every 20 minutes — or click <strong>Sync&nbsp;now</strong> anytime.</li>
          <li>Change a status on either side and the other catches up on the next sync.</li>
          <li>Tasks imported from Notion land in the team&apos;s <strong>Available</strong> pool to be picked up.</li>
          <li>Need to stop syncing? <strong>Disconnect</strong> — linked items keep their Notion link but stop updating.</li>
        </ul>
      </div>

      {/* Troubleshooting */}
      <details style={card}>
        <summary style={{ cursor: "pointer", fontSize: "var(--text-sm, 14px)", fontWeight: 700, color: "var(--color-navy-900, #1a2b4a)" }}>
          Troubleshooting
        </summary>
        <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: "var(--text-sm, 14px)", color: "var(--color-text-secondary, #475467)", lineHeight: 1.7 }}>
          <li>
            <strong>&ldquo;Unauthorized&rdquo; / invalid token</strong> — re-copy the Internal Integration Secret from
            step&nbsp;1, and make sure you completed step&nbsp;2 (the database must be shared <em>with</em> the integration).
          </li>
          <li>
            <strong>My pages aren&apos;t showing up</strong> — confirm the database is shared with the integration
            (step&nbsp;2) and the link is for the right database, then click <strong>Sync&nbsp;now</strong>.
          </li>
          <li>
            <strong>Some statuses didn&apos;t map</strong> — we auto-match common names (<em>To&nbsp;do</em>,{" "}
            <em>In&nbsp;progress</em>, <em>Done</em>, <em>Blocked</em>…). The panel shows which mapped; rename a Notion
            option to a standard name, or just tell your Pure&nbsp;Water contact and we&apos;ll map it. Unmapped statuses
            simply don&apos;t sync — nothing breaks.
          </li>
          <li>
            <strong>Will this change my Notion?</strong> Only the status field is ever written back. Your notes, dates,
            and other properties are never touched.
          </li>
        </ul>
      </details>
    </div>
  );
}
