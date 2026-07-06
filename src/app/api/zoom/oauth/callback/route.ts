import { db } from "@/lib/db";
import { exchangeCode, getMe, verifyState } from "@/lib/zoom/oauth";
import { upsertZoomConnection } from "@/lib/zoom/connection";

// OAuth redirect target: exchange the code for tokens, look up the Zoom account
// identity, and store the connection (linked to the installing app User carried in
// the signed state). The signed state is the CSRF proof.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const payload = state ? verifyState(state) : null;
  const ret = payload?.ret || "/admin";
  const back = (flag: string) => Response.redirect(new URL(`${ret}?zoom=${flag}`, request.url));

  if (oauthError || !code || !payload) return back("error");

  try {
    const tok = await exchangeCode(code);
    const me = await getMe(tok.access_token);
    const installer = await db.user.findUnique({
      where: { email: payload.email.toLowerCase() },
      select: { id: true },
    });
    await upsertZoomConnection({
      zoomUserId: me.id,
      email: me.email,
      userId: installer?.id ?? null,
      accessToken: tok.access_token,
      refreshToken: tok.refresh_token,
      expiresInSec: tok.expires_in,
      scopes: tok.scope ?? null,
    });
  } catch {
    return back("error");
  }
  return back("connected");
}
