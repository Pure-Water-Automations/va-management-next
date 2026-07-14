import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Card } from "@/components/ui/Card";
import { McpTokenManagement } from "@/components/McpTokenManagement";

export const dynamic = "force-dynamic";

export default async function McpTokensPage() {
  const user = await getCurrentUser();
  if (!user.isAdmin) redirect("/");

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
  const mcpUrl = `${base}/api/mcp/delegate`;

  return (
    <>
      <div className="page-head">
        <div>
          <div className="crumb">Admin · Settings</div>
          <h1>Delegation MCP Tokens</h1>
        </div>
      </div>

      <Card style={{ marginBottom: 8 }}>
        <p className="small" style={{ margin: 0 }}>
          Per-person access tokens for the Delegation MCP (Claude / AI connectors) — for team leads, senior VAs, and
          delegation-tier VAs to create &amp; track projects and tasks. The MCP acts <em>as</em> the token&apos;s user:
          anything they create or update is attributed to them, and it exposes only project/task tools (no deals,
          agreements, payroll, or HR). A token only works while that person has delegation authority. Tokens are shown
          once at mint time and stored hashed; revoke immediately if one leaks.
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
