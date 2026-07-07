/**
 * Profile-photo serve proxy: any authenticated console user (the directory is
 * visible to everyone) gets a 302 to a freshly presigned R2 GET — same pattern
 * as the recordings stream proxy. Cached briefly so avatar grids don't re-run
 * auth + presign per image per page view.
 */
import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { presignDownload, r2Configured } from "@/lib/r2";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ vaId: string }> },
): Promise<Response> {
  const { vaId } = await params;

  try {
    await getCurrentUser();
  } catch {
    return new Response("Not authenticated", { status: 401 });
  }

  const va = await db.va.findUnique({ where: { vaId }, select: { photoKey: true } });
  if (!va?.photoKey || !r2Configured()) return new Response("Not found", { status: 404 });

  const signed = await presignDownload(va.photoKey, 3600);
  return new Response(null, {
    status: 302,
    headers: { Location: signed, "Cache-Control": "private, max-age=1800" },
  });
}
