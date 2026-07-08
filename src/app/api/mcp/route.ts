import { runWithActor } from "@/lib/request-context";
import { handleMcpRequest, MCP_TOOLS } from "@/lib/mcp/protocol";
import { resolveMcpActor } from "@/lib/mcp/auth";
import { visibleTools } from "@/lib/mcp/access";
import { executeTool } from "@/lib/mcp/tools";

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
  const provided = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const auth = await resolveMcpActor(provided);
  if (!auth.ok) return rpcError(-32001, auth.message, auth.status);

  const actor = auth.actor;
  // The caller only ever sees (and can call) the tools their role allows.
  const tools = visibleTools(MCP_TOOLS, actor);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const res = await handleMcpRequest(body, (name, args) => runWithActor(actor.actorEmail, () => executeTool(name, args, actor)), tools);
  if (res === null) return new Response(null, { status: 202 }); // notification — no response body
  return json(res, 200);
}
