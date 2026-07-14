import { exchangeCode, refreshTokens } from "@/lib/oauth/tokens";

export const dynamic = "force-dynamic";

async function params(request: Request): Promise<Record<string, string>> {
  const ct = request.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return (await request.json().catch(() => ({}))) as Record<string, string>;
  const form = await request.formData().catch(() => null);
  return form ? Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)])) : {};
}

export async function POST(request: Request) {
  const p = await params(request);
  const fail = (error: string, status = 400) => Response.json({ error }, { status });

  if (p.grant_type === "authorization_code") {
    if (!p.code || !p.client_id || !p.code_verifier) return fail("invalid_request");
    const r = await exchangeCode({
      code: p.code, clientId: p.client_id,
      redirectUri: p.redirect_uri ?? "", codeVerifier: p.code_verifier,
    });
    if ("error" in r) return fail(r.error);
    return Response.json({
      access_token: r.accessToken, token_type: "bearer", expires_in: r.expiresIn,
      refresh_token: r.refreshToken, scope: "mcp",
    });
  }
  if (p.grant_type === "refresh_token") {
    if (!p.refresh_token || !p.client_id) return fail("invalid_request");
    const r = await refreshTokens(p.refresh_token, p.client_id);
    if ("error" in r) return fail(r.error);
    return Response.json({
      access_token: r.accessToken, token_type: "bearer", expires_in: r.expiresIn,
      refresh_token: r.refreshToken, scope: "mcp",
    });
  }
  return fail("unsupported_grant_type");
}
