import { db } from "@/lib/db";
import { toExternalRosterEntry, verifyExternalSecret } from "@/lib/external/va-profile";

// PUBLIC (service-to-service) endpoint — trusted apps such as va-world fetch a
// lightweight directory of active VAs. Gated by the EXTERNAL_APP_SECRET bearer
// token; must be on the Cloudflare Access BYPASS list (like /api/external/*).
export async function GET(request: Request): Promise<Response> {
  if (!verifyExternalSecret(request.headers.get("authorization"))) {
    return Response.json({ ok: false, error: "Unauthorized." }, { status: 401 });
  }

  const vas = await db.va.findMany({
    where: { status: "active" },
    orderBy: { name: "asc" },
  });

  return Response.json({ entries: vas.map(toExternalRosterEntry) });
}
