import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/access";
import { canUserDelegateTasks, canUserDelegateProjects } from "@/lib/auth/delegation";
import { decideAuthorization } from "@/lib/actions/oauth-consent";

export const dynamic = "force-dynamic";

// The one human-facing step in the OAuth flow: a signed-in user approves an AI
// client (ChatGPT, claude.ai) acting as themselves. getCurrentUser() redirects
// to /login when signed out, so this page is always behind the app's own auth.
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getCurrentUser(); // signed-in gate
  const sp = await searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const clientId = get("client_id");
  const redirectUri = get("redirect_uri");
  const challenge = get("code_challenge");
  const method = get("code_challenge_method") || "S256";

  const client = clientId ? await db.oAuthClient.findUnique({ where: { id: clientId } }) : null;
  const valid = !!client && client.redirectUris.includes(redirectUri) && !!challenge && method === "S256";

  if (!valid) {
    return (
      <main style={{ maxWidth: 440, margin: "48px auto", padding: 24 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Connection request invalid</h1>
        <p className="small" style={{ marginTop: 8 }}>
          Missing or mismatched client_id / redirect_uri / PKCE parameters. Ask the AI app to restart the connection.
        </p>
      </main>
    );
  }

  const [canTasks, canProjects] = await Promise.all([
    canUserDelegateTasks(user.id, user.role),
    canUserDelegateProjects(user.id, user.role),
  ]);
  const isDelegator = canTasks || canProjects;

  return (
    <main style={{ maxWidth: 440, margin: "48px auto", padding: 24 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Connect &ldquo;{client!.name}&rdquo; to the VA Console?</h1>
      <p className="small" style={{ marginTop: 12 }}>
        It will act as <strong>{user.email}</strong> ({user.role}) — it can create and manage projects &amp; tasks
        that you can, and every action is logged as you. You can revoke this anytime from the admin MCP tokens page.
      </p>
      {!isDelegator && (
        <p className="small" style={{ marginTop: 12, color: "var(--danger, #c00)" }}>
          Note: your account doesn&apos;t currently have delegation authority, so the connection will succeed but the
          tools will return &ldquo;not authorized&rdquo; until an admin enables it.
        </p>
      )}
      <form action={decideAuthorization} style={{ marginTop: 24, display: "flex", gap: 12 }}>
        <input type="hidden" name="client_id" value={clientId} />
        <input type="hidden" name="redirect_uri" value={redirectUri} />
        <input type="hidden" name="state" value={get("state")} />
        <input type="hidden" name="code_challenge" value={challenge} />
        <button className="btn" name="decision" value="approve">Allow access</button>
        <button className="btn" name="decision" value="deny">Deny</button>
      </form>
    </main>
  );
}
