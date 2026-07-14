import { redirect } from "next/navigation";
import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/Card";
import { McpTokenManagement } from "@/components/McpTokenManagement";

export const dynamic = "force-dynamic";

export default async function McpTokensPage() {
  const user = await getCurrentUser();
  // Matches /admin/users (isAllAccess, not plain isAdmin) — this page was
  // stranding the TESTER role, inconsistent with the rest of the Admin console.
  if (!isAllAccess(user)) redirect("/");

  const [tokens, users] = await Promise.all([
    db.mcpToken.findMany({
      orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
    }),
    db.user.findMany({
      where: { active: true, role: { notIn: ["CLIENT_ADMIN", "CLIENT_MEMBER"] } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: [{ name: "asc" }, { email: "asc" }],
    }),
  ]);

  const base = env.APP_BASE_URL ?? env.NEXTAUTH_URL ?? "https://team.purewaterautomations.com";
  const mcpUrl = `${base}/api/mcp`;
  const delegationMcpUrl = `${base}/api/mcp/delegate`;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Admin · Settings</div>
          <h1>MCP Tokens</h1>
        </div>
      </div>

      <Card style={{ marginBottom: 8 }}>
        <p className="small" style={{ margin: 0 }}>
          Per-person access tokens for the VA Management MCPs (Claude / AI connectors). The same token works on both
          endpoints — the MCP acts <em>as</em> the token&apos;s user in either case: <code>{mcpUrl}</code> gates tools
          by their <em>role</em> (their full console access, incl. HR/payroll/recruitment/sales for those roles); the
          narrower <code>{delegationMcpUrl}</code> exposes only project/task tools, gated by delegation authority — use
          it when a connector should only ever create/track projects and tasks, nothing else. Tokens are shown once at
          mint time and stored hashed; revoke immediately if one leaks.
        </p>
      </Card>

      <Card>
        <McpTokenManagement
          mcpUrl={mcpUrl}
          users={users}
          tokens={tokens.map((t) => ({
            id: t.id,
            label: t.label,
            createdAt: t.createdAt.toISOString(),
            lastUsedAt: t.lastUsedAt?.toISOString() ?? null,
            revokedAt: t.revokedAt?.toISOString() ?? null,
            user: t.user,
          }))}
        />
      </Card>
    </>
  );
}
