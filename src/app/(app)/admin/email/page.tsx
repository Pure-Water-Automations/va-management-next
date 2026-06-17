import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { senderStatus, redirectUri, oauthClient } from "@/lib/email-oauth";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { TestEmailButton } from "@/components/TestEmailButton";
import { EmailTestMode } from "@/components/EmailTestMode";

export const dynamic = "force-dynamic";

export default async function EmailSenderPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const user = await getCurrentUser();
  if (!user.isAdmin) redirect("/");
  const sp = await searchParams;

  const [status, fromSetting, redirectRow] = await Promise.all([
    senderStatus(),
    db.setting.findUnique({ where: { key: "system_email_from" } }),
    db.setting.findUnique({ where: { key: "email_redirect_to" }, select: { value: true } }),
  ]);
  const clientConfigured = !!oauthClient();

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Admin · Settings</div>
          <h1>Email sender</h1>
        </div>
      </div>

      {sp.connected && (
        <Card style={{ marginBottom: 16, borderLeft: "3px solid var(--color-success)" }}>
          <strong>Connected ✅</strong> — alerts &amp; reminders will now send from <strong>{sp.connected}</strong>.
          {sp.norefresh && <div className="small" style={{ marginTop: 6, color: "var(--color-warning-dark)" }}>Note: Google didn’t return a refresh token. Click Connect again and make sure to allow offline access.</div>}
        </Card>
      )}
      {sp.error && (
        <Card style={{ marginBottom: 16, borderLeft: "3px solid var(--color-error)" }}>
          <strong>Couldn’t connect</strong> — {sp.error.replace(/_/g, " ")}.
        </Card>
      )}

      <Card style={{ marginBottom: 16, borderLeft: redirectRow?.value ? "3px solid var(--color-warning)" : undefined }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: "0 0 12px" }}>Email test mode</h2>
        <EmailTestMode current={redirectRow?.value ?? ""} defaultTarget="riza.purewaterautomations@gmail.com" />
      </Card>

      <Card style={{ marginBottom: 16 }}>
        <h2 style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-xl)", margin: "0 0 12px" }}>Sending account</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
          {status.connected
            ? <Badge variant="success" dot>Connected</Badge>
            : <Badge variant="warning" dot>Not connected</Badge>}
          <span className="small">{status.connected ? status.email ?? "(account)" : "no sending account yet"}</span>
        </div>
        <div className="small" style={{ marginBottom: 16 }}>
          Current “from” address: <strong>{fromSetting?.value || "(unset)"}</strong>. Until you connect an account, mail
          falls back to the workspace token and Google may rewrite the From address.
        </div>
        {clientConfigured ? (
          <Button href="/api/email-auth/start" variant="primary">
            {status.connected ? "Reconnect a sending account" : "Connect a sending Gmail"}
          </Button>
        ) : (
          <div className="small" style={{ color: "var(--color-error-dark)" }}>
            OAuth client isn’t configured (GOOGLE_OAUTH_CLIENT_ID / SECRET). Ask the developer to set it.
          </div>
        )}
        {status.connected && fromSetting?.value && <TestEmailButton />}
      </Card>

      <Card variant="flat">
        <h3 style={{ margin: "0 0 8px", fontSize: "var(--text-md)" }}>One-time Google setup</h3>
        <p className="small" style={{ marginTop: 0 }}>
          Before connecting, this exact redirect URI must be registered on the OAuth client in Google Cloud Console
          (APIs &amp; Services → Credentials → your OAuth client → Authorized redirect URIs):
        </p>
        <code style={{ display: "block", padding: "10px 12px", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: "var(--text-sm)", wordBreak: "break-all" }}>
          {redirectUri()}
        </code>
        <p className="small">
          Then click Connect, sign in as <strong>admin@purewaterautomations.com</strong>, and allow sending email.
          The account must be a test user on the OAuth consent screen (or the app published).
        </p>
      </Card>
    </>
  );
}
