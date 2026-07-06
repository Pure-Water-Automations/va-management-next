import type { CSSProperties } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { zoomOauthConfigured, zoomRedirectUri } from "@/lib/zoom/oauth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

const codeStyle: CSSProperties = {
  display: "block",
  padding: "10px 12px",
  background: "var(--color-surface)",
  border: "1px solid var(--color-border)",
  borderRadius: 8,
  fontSize: "var(--text-sm)",
  wordBreak: "break-all",
};
const h2Style: CSSProperties = {
  fontFamily: "var(--font-display)",
  fontSize: "var(--text-xl)",
  margin: "0 0 12px",
};

export default async function ZoomAdminPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await getCurrentUser();
  if (!isAllAccess(user)) redirect("/");
  const sp = await searchParams;

  const connections = await db.zoomConnection.findMany({
    where: { active: true },
    select: { email: true, zoomUserId: true, createdAt: true, scopes: true },
    orderBy: { createdAt: "desc" },
  });
  const configured = zoomOauthConfigured();
  const redirectUrl = zoomRedirectUri();
  const webhookUrl = `${(env.APP_BASE_URL || "https://dev-team.pwasecondbrain.uk").replace(/\/+$/, "")}/api/zoom/webhook`;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Admin · Settings</div>
          <h1>Zoom Meeting App</h1>
        </div>
      </div>

      {sp.zoom === "connected" && (
        <Card style={{ marginBottom: 16, borderLeft: "3px solid var(--color-success)" }}>
          <strong>Connected ✅</strong> — recording transcripts from this Zoom account will now flow into Meeting Actions.
        </Card>
      )}
      {sp.zoom === "error" && (
        <Card style={{ marginBottom: 16, borderLeft: "3px solid var(--color-error)" }}>
          <strong>Couldn’t connect</strong> — the authorization didn’t complete. Confirm the app’s scopes include{" "}
          <code>user:read</code> and that the redirect URL below is registered, then try again.
        </Card>
      )}
      {sp.zoom === "unconfigured" && (
        <Card style={{ marginBottom: 16, borderLeft: "3px solid var(--color-warning)" }}>
          <strong>Not configured</strong> — <code>ZOOM_CLIENT_ID</code> / <code>ZOOM_CLIENT_SECRET</code> aren’t set on this
          environment yet.
        </Card>
      )}

      <Card style={{ marginBottom: 16 }}>
        <h2 style={h2Style}>Connected accounts</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          {connections.length > 0 ? (
            <Badge variant="success" dot>{connections.length} connected</Badge>
          ) : (
            <Badge variant="warning" dot>None connected</Badge>
          )}
        </div>
        <p className="small" style={{ marginTop: 0, marginBottom: 16 }}>
          Each connected account’s cloud-recording transcripts are captured after the meeting and turned into proposed
          items in <strong>Meeting Actions</strong> — no bot joins the call. The host must have cloud recording + audio
          transcription enabled.
        </p>
        {connections.length > 0 && (
          <ul style={{ margin: "0 0 16px", paddingLeft: 18 }}>
            {connections.map((c) => (
              <li key={c.zoomUserId} className="small">
                <strong>{c.email}</strong> — connected {c.createdAt.toISOString().slice(0, 10)}
              </li>
            ))}
          </ul>
        )}
        {configured ? (
          <Button href="/api/zoom/oauth/start?return=/admin/zoom" variant="primary">
            {connections.length > 0 ? "Connect another Zoom account" : "Connect a Zoom account"}
          </Button>
        ) : (
          <div className="small" style={{ color: "var(--color-error-dark)" }}>
            Zoom OAuth isn’t configured (ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET). Ask the developer to set them.
          </div>
        )}
      </Card>

      <Card variant="flat">
        <h3 style={{ margin: "0 0 8px", fontSize: "var(--text-md)" }}>One-time Marketplace setup</h3>
        <p className="small" style={{ marginTop: 0 }}>
          Register these on the Zoom Marketplace app (General / User-Managed), then use Connect above:
        </p>
        <div className="small" style={{ marginBottom: 6 }}>OAuth redirect URL:</div>
        <code style={codeStyle}>{redirectUrl}</code>
        <div className="small" style={{ margin: "10px 0 6px" }}>Event notification endpoint URL:</div>
        <code style={codeStyle}>{webhookUrl}</code>
        <p className="small">
          Subscribe the event <code>recording.transcript_completed</code>. Scopes:{" "}
          <code>cloud_recording:read:list_recording_files</code> + <code>user:read</code>.
        </p>
      </Card>
    </>
  );
}
