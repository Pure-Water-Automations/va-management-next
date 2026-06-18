import { getCurrentUser } from "@/lib/auth/access";
import { canUserDelegateProjects } from "@/lib/auth/delegation";
import { getProjectDetail } from "@/lib/reads/projects";
import { searchSecondBrain } from "@/lib/secondbrain/client";
import { buildQueries, synthesize } from "@/lib/secondbrain/enhance";

export const dynamic = "force-dynamic";

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return Response.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  if (!user.isAdmin && !(await canUserDelegateProjects(user.id, user.role))) {
    return Response.json({ ok: false, error: "Not authorized" }, { status: 403 });
  }

  const project = await getProjectDetail(id);
  if (!project) return Response.json({ ok: false, error: "Project not found" }, { status: 404 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) => controller.enqueue(encoder.encode(sse(event, data)));
      try {
        const queries = buildQueries({ name: project.name, client: project.client, description: project.description });
        const { results, errors } = await searchSecondBrain(queries);

        let idx = 0;
        for (const r of results) send("context", { id: `c${idx++}`, ...r });
        for (const e of errors) send("error", e);

        const synthesis = await synthesize(
          { name: project.name, client: project.client, description: project.description },
          results,
        );
        send("tasks", {
          contextSummary: synthesis.contextSummary,
          tasks: synthesis.tasks.map((t, i) => ({ id: `t${i}`, ...t })),
        });
      } catch (err) {
        send("error", { source: "enhance", message: err instanceof Error ? err.message : "Enhance failed" });
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
