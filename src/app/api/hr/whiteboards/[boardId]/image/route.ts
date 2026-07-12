import { getCurrentUser } from "@/lib/auth/access";
import { canManageTasks } from "@/lib/auth/roles";
import { db } from "@/lib/db";
import { r2Configured, r2Put, presignDownload } from "@/lib/r2";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB
const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
};

async function authed(boardId: string) {
  const user = await getCurrentUser();
  if (!user.isAdmin && !canManageTasks(user.role)) return null;
  const board = await db.projectWhiteboard.findUnique({ where: { id: boardId }, select: { id: true } });
  return board ? user : null;
}

// POST: upload an image for this board. Bytes go through the server to R2 (small files,
// avoids a browser→R2 CORS setup). Returns the object key, which the client stores on
// the image element and later renders via the GET below.
export async function POST(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  let user;
  try {
    user = await authed(boardId);
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!user) return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  if (!r2Configured()) return Response.json({ ok: false, error: "Image storage is not configured" }, { status: 503 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return Response.json({ ok: false, error: "Invalid upload" }, { status: 400 });
  }
  if (!file) return Response.json({ ok: false, error: "No file" }, { status: 400 });

  const ext = EXT[file.type];
  if (!ext) return Response.json({ ok: false, error: "Unsupported image type" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ ok: false, error: "Image too large (max 12 MB)" }, { status: 400 });

  const key = `whiteboards/${boardId}/${crypto.randomUUID()}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());
  await r2Put(key, bytes, file.type);
  return Response.json({ ok: true, key });
}

// GET: serve an image by key (302 → short-lived presigned R2 GET). Scoped to this board's
// key prefix so a valid session can't read other boards' or recordings' objects.
export async function GET(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  const { boardId } = await params;
  let user;
  try {
    user = await authed(boardId);
  } catch {
    return new Response("Not authenticated", { status: 401 });
  }
  if (!user) return new Response("Not authorized", { status: 403 });

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key.startsWith(`whiteboards/${boardId}/`)) return new Response("Bad key", { status: 400 });
  if (!r2Configured()) return new Response("Not configured", { status: 503 });

  const url = await presignDownload(key, 3600);
  return Response.redirect(url, 302);
}
