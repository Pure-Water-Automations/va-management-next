import { getCurrentUser, isFounder } from "@/lib/auth/access";
import { createProject } from "@/lib/actions/projects";
import { createTask } from "@/lib/actions/tasks";
import { runWithActor } from "@/lib/request-context";

export const dynamic = "force-dynamic";

type AcceptedTask = { title: string; priority?: string };
type AcceptedProject = { name: string; description?: string; client?: string; tasks?: AcceptedTask[] };

export async function POST(request: Request) {
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

  let body: { projects?: AcceptedProject[] };
  try {
    const raw = await request.text();
    body = raw ? JSON.parse(raw) : {};
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const projects = Array.isArray(body.projects) ? body.projects : [];

  return runWithActor(user.email, async () => {
    const created: { name: string; id: string; tasks: number }[] = [];
    const failed: { name: string; error: string }[] = [];

    for (const p of projects) {
      try {
        if (!p.name?.trim()) throw new Error("Missing project name");
        // New tasks default to the creator as owner (no surprise assignment emails to VAs).
        const project = await createProject(user.id, user.role, {
          name: p.name,
          description: p.description,
          client: p.client,
          ownerId: user.id,
        });
        let taskCount = 0;
        for (const t of Array.isArray(p.tasks) ? p.tasks : []) {
          if (!t.title?.trim()) continue;
          try {
            await createTask(user.id, user.role, {
              title: t.title,
              priority: t.priority,
              projectId: project.id,
              assignedToId: user.id,
            });
            taskCount++;
          } catch {
            /* skip an individual task failure; the project is still created */
          }
        }
        created.push({ name: project.name, id: project.id, tasks: taskCount });
      } catch (err) {
        failed.push({ name: p.name || "(unnamed)", error: err instanceof Error ? err.message : "Failed" });
      }
    }

    return Response.json({ ok: true, result: { created, failed } });
  });
}
