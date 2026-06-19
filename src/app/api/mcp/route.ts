import { db } from "@/lib/db";
import { runWithActor } from "@/lib/request-context";
import { handleMcpRequest } from "@/lib/mcp/protocol";
import { executeTool, type McpCtx } from "@/lib/mcp/tools";

export const dynamic = "force-dynamic";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const rpcError = (code: number, message: string, status: number) => json({ jsonrpc: "2.0", id: null, error: { code, message } }, status);

// MCP Streamable-HTTP does server-initiated messages over GET/SSE, which we don't use
// (request/response tools only). The SDK client tolerates this not being available.
export async function GET() {
  return new Response("VA Management MCP — POST JSON-RPC (Streamable HTTP).", { status: 405 });
}

export async function POST(request: Request) {
  const token = process.env.MCP_API_TOKEN?.trim();
  if (!token) return rpcError(-32000, "MCP endpoint is not configured (no MCP_API_TOKEN).", 503);

  const provided = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!provided || provided !== token) return rpcError(-32001, "Unauthorized — missing or invalid bearer token.", 401);

  // The token acts as a single admin service identity (configurable).
  const actorEmail = (process.env.MCP_ACTOR_EMAIL || "okamotomiak@gmail.com").toLowerCase();
  const user = await db.user.findUnique({ where: { email: actorEmail }, select: { id: true, role: true, active: true } });
  if (!user || !user.active) return rpcError(-32002, `MCP service user (${actorEmail}) not found or inactive.`, 500);
  const ctx: McpCtx = { actorId: user.id, actorRole: user.role };

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const res = await handleMcpRequest(body, (name, args) => runWithActor(actorEmail, () => executeTool(name, args, ctx)));
  if (res === null) return new Response(null, { status: 202 }); // notification — no response body
  return json(res, 200);
}
