import { getCurrentUser, isFounder } from "@/lib/auth/access";
import { getProjectDetail } from "@/lib/reads/projects";
import { enhanceResearch } from "@/lib/secondbrain/agent";

export const dynamic = "force-dynamic";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  // Beta + founder-only (Enhance / Discover are hidden from staff).
  if (!isFounder(user.email)) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  let body: { prompt?: unknown; answers?: unknown } = {};
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    body = {};
  }
  const prompt = typeof body.prompt === "string" ? body.prompt : undefined;
  const answers = typeof body.answers === "string" ? body.answers : undefined;

  const project = await getProjectDetail(id);
  if (!project) return Response.json({ ok: false, error: "Project not found" }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)));
      try {
        const res = await enhanceResearch({
          project: { name: project.name, client: project.client, description: project.description },
          prompt,
          answers,
          onStep: (label) => send("step", { label }),
        });
        if (res.kind === "questions") {
          send("questions", { questions: res.questions });
        } else if (res.kind === "findings") {
          send("findings", {
            brief: res.brief,
            tasks: res.tasks.map((t, i) => ({ id: `t${i}`, ...t })),
            sources: res.sources,
          });
        } else {
          send("error", { message: res.message });
        }
      } catch (err) {
        send("error", { message: err instanceof Error ? err.message : "Enhance failed" });
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
