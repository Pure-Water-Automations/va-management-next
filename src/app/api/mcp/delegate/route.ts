// Delegation MCP — an isolated endpoint for team leads / senior VAs / delegation-tier
// VAs to create & track projects and tasks from an AI connector. Distinct from the
// admin service endpoint (/api/mcp): per-user bearer tokens (minted at
// /admin/mcp-tokens) attribute every write to the real person, and only the nine
// delegation tools are exposed — deals, agreements, payroll, etc. are unreachable here.

import { runWithActor } from "@/lib/request-context";
import { handleMcpRequest, MCP_TOOLS } from "@/lib/mcp/protocol";
import { resolveDelegationActor } from "@/lib/mcp/token-auth";
import { executeTool, type McpCtx } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

const DELEGATION_TOOL_NAMES = new Set([
  "list_projects",
  "create_project",
  "list_tasks",
  "create_task",
  "get_task",
  "update_task_status",
  "update_task",
  "reassign_task",
  "add_task_comment",
  "list_assignees",
  "update_project",
]);
const DELEGATION_TOOLS = MCP_TOOLS.filter((t) => DELEGATION_TOOL_NAMES.has(t.name));

const json = (body: unknown, status: number, headers?: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const rpcError = (code: number, message: string, status: number, headers?: Record<string, string>) =>
  json({ jsonrpc: "2.0", id: null, error: { code, message } }, status, headers);

export async function GET(request: Request) {
  // Carry the OAuth discovery hint here too, so a client that probes with GET
  // before POST can still find the resource metadata.
  const proto = request.headers.get("x-forwarded-proto") ?? "https";
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost";
  return new Response("VA Management Delegation MCP — POST JSON-RPC (Streamable HTTP).", {
    status: 401,
    headers: { "WWW-Authenticate": `Bearer resource_metadata="${proto}://${host}/.well-known/oauth-protected-resource"` },
  });
}

export async function POST(request: Request) {
  const provided = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const auth = await resolveDelegationActor(provided);
  if (!auth.ok) {
    // Point unauthenticated clients at the OAuth resource metadata (RFC 9728) so
    // Claude/ChatGPT can discover and start the login flow instead of just failing.
    const proto = request.headers.get("x-forwarded-proto") ?? "https";
    const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "localhost";
    const wwwAuth = { "WWW-Authenticate": `Bearer resource_metadata="${proto}://${host}/.well-known/oauth-protected-resource"` };
    return rpcError(-32001, auth.message, auth.status, auth.status === 401 ? wwwAuth : undefined);
  }

  const actor = auth.actor;
  // This endpoint is for delegators only. Individual tools still enforce their own
  // authority underneath (e.g. reassign needs canManageTasks), but a token with no
  // delegation authority at all can't use the endpoint — so it stops working the
  // moment an admin removes that person's delegation flag.
  if (!actor.canDelegateTasks && !actor.canDelegateProjects) {
    return rpcError(-32003, "This account doesn't have delegation authority — ask an admin to enable it.", 403);
  }

  // McpCtx is the shared, role-gated McpActor shape (also used by /api/mcp), but
  // this route only ever exposes DELEGATION_TOOLS (project/task tools) — none of
  // which read isAdmin/vaId — so those fields are safe stand-ins here.
  const ctx: McpCtx = {
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorName: actor.actorName,
    actorRole: actor.actorRole,
    isAdmin: false,
    canDelegate: actor.canDelegateTasks || actor.canDelegateProjects,
    vaId: null,
  };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const res = await handleMcpRequest(
    body,
    (name, args) => runWithActor(actor.actorEmail, () => executeTool(name, args, ctx)),
    DELEGATION_TOOLS,
  );
  if (res === null) return new Response(null, { status: 202 }); // notification — no response body
  return json(res, 200);
}
