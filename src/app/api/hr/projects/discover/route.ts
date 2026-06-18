import { getCurrentUser } from "@/lib/auth/access";
import { canUserDelegateProjects } from "@/lib/auth/delegation";
import { db } from "@/lib/db";
import { discoverProjects } from "@/lib/secondbrain/discover";

export const dynamic = "force-dynamic";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!user.isAdmin && !(await canUserDelegateProjects(user.id, user.role))) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  let body: { prompt?: unknown } = {};
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const prompt = typeof body.prompt === "string" ? body.prompt : undefined;

  const existing = await db.project.findMany({ select: { name: true }, orderBy: { createdAt: "desc" }, take: 200 });
  const existingProjectNames = existing.map((p) => p.name);

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const windowLabel = `the last 7 days (since ${since})`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)));
      try {
        const res = await discoverProjects({
          existingProjectNames,
          windowLabel,
          prompt,
          onStep: (label) => send("step", { label }),
        });
        if (res.kind === "proposals") send("proposals", { projects: res.projects });
        else send("error", { message: res.message });
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Scan failed" });
      } finally {
        send("done", {});
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
