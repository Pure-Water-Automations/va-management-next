import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { validateSnapshot } from "@/lib/cfo/types";

export const dynamic = "force-dynamic";

const MAX_BYTES = 512 * 1024; // 512KB cap on the pushed payload
const KEEP = 60; // trend history retained

// Machine-to-machine bearer, mirroring verifyExternalSecret. Denies when the
// token is unset (endpoint self-disabled) or the header is missing/wrong.
// Constant-time compare on equal-length buffers.
function authed(authHeader: string | null): boolean {
  const secret = env.CFO_SNAPSHOT_TOKEN;
  if (!secret || !authHeader) return false;
  const m = /^Bearer (.+)$/.exec(authHeader.trim());
  if (!m) return false;
  const a = Buffer.from(m[1]);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

// POST /api/cfo/snapshot — the Mac-side analyst/skill pushes derived, read-only
// financial JSON here. NOT a NextAuth route (no session); gated by CFO_SNAPSHOT_TOKEN.
// Must be on the Cloudflare Access BYPASS list, like /api/external/*.
export async function POST(request: Request): Promise<Response> {
  if (!authed(request.headers.get("authorization"))) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BYTES) {
    return Response.json({ ok: false, error: "Payload too large" }, { status: 413 });
  }
  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : null;
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const v = validateSnapshot(parsed);
  if (!v.ok) return Response.json({ ok: false, error: v.error }, { status: 400 });

  const computedAt = new Date(v.value.computed_at);
  if (Number.isNaN(computedAt.getTime())) {
    return Response.json({ ok: false, error: "computed_at is not a valid date" }, { status: 400 });
  }

  const row = await db.cfoSnapshot.create({
    data: {
      computedAt,
      hasNarrative: typeof v.value.narrative === "string" && v.value.narrative.trim().length > 0,
      payload: v.value as object,
    },
    select: { id: true, createdAt: true },
  });

  // Prune to the last KEEP rows (keep newest by createdAt).
  const survivors = await db.cfoSnapshot.findMany({
    orderBy: { createdAt: "desc" },
    skip: KEEP,
    select: { id: true },
  });
  if (survivors.length) {
    await db.cfoSnapshot.deleteMany({ where: { id: { in: survivors.map((r) => r.id) } } });
  }

  return Response.json({ ok: true, id: row.id, createdAt: row.createdAt });
}
