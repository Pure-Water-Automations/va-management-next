import { getCurrentUser } from "@/lib/auth/access";
import { canManageNotionForOrg } from "@/lib/auth/notion-access";
import { exchangeCode, verifyState } from "@/lib/notion-oauth";
import { storeOauthToken } from "@/lib/notion-engine";

// OAuth redirect target: exchange the code for a token, store it, then send the
// user back to the connect page to pick which databases to sync.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const payload = state ? verifyState(state) : null;
  const ret = payload?.ret || "/client/settings";
  const back = (flag: string) => Response.redirect(new URL(`${ret}?notion=${flag}`, request.url));

  if (oauthError || !code || !payload) return back("error");

  // The signed state is the CSRF proof; if a session is present, re-check authz too.
  let email: string | undefined;
  try {
    const user = await getCurrentUser();
    email = user.email;
    if (!(await canManageNotionForOrg(user, payload.orgId))) return back("error");
  } catch {
    /* session may have been dropped across the redirect — the signed state still gates it */
  }

  try {
    const tok = await exchangeCode(code);
    await storeOauthToken({ clientOrganizationId: payload.orgId, token: tok.access_token, createdByEmail: email });
  } catch {
    return back("error");
  }
  return back("pick");
}
