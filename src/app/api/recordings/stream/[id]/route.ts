/**
 * Playback proxy: checks auth/visibility, then 302-redirects to a freshly presigned
 * R2 GET URL. Keeps presigned URLs out of page HTML and survives expiry — the browser
 * re-requests (with its Range header) on each seek, and R2 honors Range on the target.
 * Pass ?download=1 to force an attachment download instead of inline playback.
 */
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { canSeeRecording } from "@/lib/actions/recordings";
import { presignDownload, r2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return new Response("Not authenticated", { status: 401 });
  }

  const rec = await db.recording.findUnique({
    where: { id },
    select: {
      objectKey: true,
      status: true,
      title: true,
      uploaderUserId: true,
      vaId: true,
      visibility: true,
      va: { select: { supervisorVaId: true } },
    },
  });
  if (!rec) return new Response("Not found", { status: 404 });

  const visible = canSeeRecording(user, {
    uploaderUserId: rec.uploaderUserId,
    vaId: rec.vaId,
    visibility: rec.visibility,
    ownerSupervisorVaId: rec.va?.supervisorVaId ?? null,
  });
  if (!visible) return new Response("Not found", { status: 404 });
  if (rec.status !== "ready" || !r2Configured()) {
    return new Response("Recording not available", { status: 409 });
  }

  const download = new URL(request.url).searchParams.get("download") === "1";
  const signed = await presignDownload(
    rec.objectKey,
    3600,
    download ? `${rec.title || "recording"}.webm` : undefined,
  );
  return Response.redirect(signed, 302);
}
