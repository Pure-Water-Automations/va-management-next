import { requestOrigin } from "@/lib/oauth/tokens";
import { authorizationServerMetadata } from "@/lib/oauth/metadata";

export const dynamic = "force-dynamic";

// Some clients also probe a path-suffixed authorization-server metadata URL.
// The issuer is always the origin, so serve the same document here too.
export async function GET(request: Request) {
  return Response.json(authorizationServerMetadata(requestOrigin(request)));
}
