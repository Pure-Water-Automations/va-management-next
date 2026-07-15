import { requestOrigin } from "@/lib/oauth/tokens";
import { protectedResourceMetadata } from "@/lib/oauth/metadata";

export const dynamic = "force-dynamic";

// RFC 9728 §3.1: a client derives the metadata URL by inserting the well-known
// path between host and the resource path, e.g.
// /.well-known/oauth-protected-resource/api/mcp/delegate. Serve the same metadata
// here (with `resource` reflecting the requested path) so spec-compliant MCP
// clients (Claude, ChatGPT) that build the suffixed URL can discover us.
export async function GET(request: Request, { params }: { params: Promise<{ resource: string[] }> }) {
  const { resource } = await params;
  const origin = requestOrigin(request);
  const meta = protectedResourceMetadata(origin);
  const path = (resource ?? []).join("/");
  return Response.json({ ...meta, resource: path ? `${origin}/${path}` : meta.resource });
}
