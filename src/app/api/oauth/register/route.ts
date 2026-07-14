import { z } from "zod";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

const Body = z.object({
  client_name: z.string().max(200).optional(),
  redirect_uris: z.array(z.string().url().or(z.string().regex(/^[a-z][a-z0-9+.-]*:\/\//i))).min(1).max(10),
});

// A bare prefix check (`startsWith("http://localhost")`) would also accept
// "http://localhost.evil.com" — parse the URL and compare the actual hostname.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
function isAllowedRedirectUri(u: string): boolean {
  let url: URL;
  try { url = new URL(u); } catch { return false; }
  if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname);
  return true; // https:// and custom (native-app) schemes
}

// Dynamic Client Registration (RFC 7591) — public clients only (ChatGPT,
// claude.ai self-register on first connect). No auth: any client may register,
// but a registered client_id can only ever redeem codes/tokens for the
// redirect_uris it registered, so this doesn't grant access by itself.
export async function POST(request: Request) {
  let body: unknown;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_client_metadata" }, { status: 400 }); }
  const parsed = Body.safeParse(body);
  if (!parsed.success) return Response.json({ error: "invalid_client_metadata" }, { status: 400 });
  const bad = parsed.data.redirect_uris.find((u) => !isAllowedRedirectUri(u));
  if (bad) return Response.json({ error: "invalid_redirect_uri" }, { status: 400 });
  const client = await db.oAuthClient.create({
    data: { name: parsed.data.client_name ?? "MCP client", redirectUris: parsed.data.redirect_uris },
  });
  return Response.json(
    {
      client_id: client.id,
      client_name: client.name,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    { status: 201 },
  );
}
