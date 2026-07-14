import { requestOrigin } from "@/lib/oauth/tokens";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const o = requestOrigin(request);
  return Response.json({
    resource: `${o}/api/mcp/delegate`,
    authorization_servers: [o],
    bearer_methods_supported: ["header"],
    scopes_supported: ["mcp"],
  });
}
