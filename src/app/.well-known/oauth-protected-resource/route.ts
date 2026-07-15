import { requestOrigin } from "@/lib/oauth/tokens";
import { protectedResourceMetadata } from "@/lib/oauth/metadata";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return Response.json(protectedResourceMetadata(requestOrigin(request)));
}
