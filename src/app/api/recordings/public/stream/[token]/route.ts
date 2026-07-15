/**
 * Public playback proxy for a "link"-visibility recording, keyed by share token
 * instead of a session — mirrors /api/recordings/stream/[id] but with no auth,
 * since the token itself is the credential (same model as a Loom share link).
 */
import { db } from "@/lib/db";
import { presignDownload, r2Configured } from "@/lib/r2";
import { isPubliclyViewable } from "@/lib/actions/recording-access";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  const rec = await db.recording.findUnique({
    where: { shareToken: token },
    select: { objectKey: true, status: true, visibility: true, title: true },
  });
  if (!rec || !isPubliclyViewable(rec)) return new Response("Not found", { status: 404 });
  if (!r2Configured()) {
    return new Response("Recording not available", { status: 409 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const signed = await presignDownload(
    rec.objectKey,
    3600,
    download ? `${rec.title || "recording"}.webm` : undefined,
  );
  return new Response(null, {
    status: 302,
    headers: {
      Location: signed,
      "Cache-Control": download ? "no-store" : "private, max-age=1800",
    },
  });
}
