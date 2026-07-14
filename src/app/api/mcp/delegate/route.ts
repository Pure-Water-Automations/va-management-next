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
  "reassign_task",
  "add_task_comment",
  "list_assignees",
]);
const DELEGATION_TOOLS = MCP_TOOLS.filter((t) => DELEGATION_TOOL_NAMES.has(t.name));

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const rpcError = (code: number, message: string, status: number) =>
  json({ jsonrpc: "2.0", id: null, error: { code, message } }, status);

export async function GET() {
  return new Response("VA Management Delegation MCP — POST JSON-RPC (Streamable HTTP).", { status: 405 });
}

export async function POST(request: Request) {
  const provided = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const auth = await resolveDelegationActor(provided);
  if (!auth.ok) return rpcError(-32001, auth.message, auth.status);

  const actor = auth.actor;
  // This endpoint is for delegators only. Individual tools still enforce their own
  // authority underneath (e.g. reassign needs canManageTasks), but a token with no
  // delegation authority at all can't use the endpoint — so it stops working the
  // moment an admin removes that person's delegation flag.
  if (!actor.canDelegateTasks && !actor.canDelegateProjects) {
    return rpcError(-32003, "This account doesn't have delegation authority — ask an admin to enable it.", 403);
  }

  const ctx: McpCtx = { actorId: actor.actorId, actorRole: actor.actorRole };

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
