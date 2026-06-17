import { getCurrentUser } from "@/lib/auth/access";
import { canUserDelegateProjects } from "@/lib/auth/delegation";
import { getProjectDetail } from "@/lib/reads/projects";
import { updateProject } from "@/lib/actions/projects";
import { createTask } from "@/lib/actions/tasks";
import { mergeContextIntoDescription } from "@/lib/secondbrain/enhance";
import { runWithActor } from "@/lib/request-context";
import type { SbResult } from "@/lib/secondbrain/client";

export const dynamic = "force-dynamic";

type AcceptedTask = {
  title: string;
  instructions?: string;
  priority?: string;
  assignedToId?: string;
  dueDate?: string;
  link?: string;
};

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
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

  let body: { acceptedContext?: SbResult[]; acceptedTasks?: AcceptedTask[] };
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const acceptedContext = Array.isArray(body.acceptedContext) ? body.acceptedContext : [];
  const acceptedTasks = Array.isArray(body.acceptedTasks) ? body.acceptedTasks : [];

  const project = await getProjectDetail(id);
  if (!project) return Response.json({ ok: false, error: "Project not found" }, { status: 404 });

  return runWithActor(user.email, async () => {
    // 1) Merge accepted context into the description (independent of task creation).
    let descriptionUpdated = false;
    if (acceptedContext.length > 0) {
      const merged = mergeContextIntoDescription(project.description, acceptedContext);
      await updateProject(user.id, user.role, id, { description: merged });
      descriptionUpdated = true;
    }

    // 2) Create accepted tasks one at a time; report per-task outcome.
    const created: string[] = [];
    const failed: { title: string; error: string }[] = [];
    for (const t of acceptedTasks) {
      try {
        if (!t.assignedToId) throw new Error("No assignee selected");
        const task = await createTask(user.id, user.role, {
          title: t.title,
          instructions: t.instructions,
          priority: t.priority,
          projectId: id,
          assignedToId: t.assignedToId,
          dueDate: t.dueDate,
          links: t.link,
        });
        created.push(task.id);
      } catch (err) {
        failed.push({ title: t.title, error: err instanceof Error ? err.message : "Failed" });
      }
    }

    return Response.json({ ok: true, result: { descriptionUpdated, created: created.length, failed } });
  });
}
