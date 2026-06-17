import { db } from "@/lib/db";
import { toExternalVaProfile, verifyExternalSecret } from "@/lib/external/va-profile";

// PUBLIC (service-to-service) endpoint — trusted apps such as va-world call this
// to resolve a VA's identity by email. There is no Cloudflare Access browser
// session here, so this path must be added to the Cloudflare Access BYPASS list
// (alongside /apply, /sign). Access is gated instead by the EXTERNAL_APP_SECRET
// bearer token verified below.
export async function GET(request: Request): Promise<Response> {
  if (!verifyExternalSecret(request.headers.get("authorization"))) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const email = new URL(request.url).searchParams.get("email");
  if (!email) {
    return Response.json({ ok: false, error: "Missing email." }, { status: 400 });
  }

  const va = await db.va.findUnique({ where: { email } });
  if (!va) {
    return Response.json({ ok: false, error: "Not found." }, { status: 404 });
  }

  return Response.json(toExternalVaProfile(va));
}
