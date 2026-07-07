import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";

/** Command-palette search across projects + tasks + hub pages + scratchpad. */
export async function GET(request: Request): Promise<Response> {
  try {
    await getCurrentUser();
  } catch {
    return Response.json({ projects: [], tasks: [], pages: [], scratch: [] }, { status: 401 });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return Response.json({ projects: [], tasks: [], pages: [], scratch: [] });

  const [projects, tasks, pages, scratch] = await Promise.all([
    db.project.findMany({
      where: { name: { contains: q, mode: "insensitive" } },
      select: { id: true, name: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    db.task.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    db.page.findMany({
      where: { title: { contains: q, mode: "insensitive" } },
      select: { id: true, title: true, scope: true, projectId: true },
      orderBy: { updatedAt: "desc" },
      take: 8,
    }),
    db.scratchItem.findMany({
      where: { text: { contains: q, mode: "insensitive" }, promotedTaskId: null },
      select: { id: true, text: true, projectId: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
  ]);

  return Response.json({
    projects,
    tasks,
    pages: pages.map((p) => ({
      id: p.id,
      title: p.title,
      href:
        p.scope === "LIBRARY"
          ? `/hr/library?page=${p.id}`
          : `/hr/projects/${p.projectId}?tab=page&page=${p.id}`,
    })),
    scratch: scratch.map((s) => ({
      id: s.id,
      text: s.text,
      href: `/hr/projects/${s.projectId}?tab=scratch`,
    })),
  });
}
