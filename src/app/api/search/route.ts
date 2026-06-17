import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";

/** Command-palette search across projects + tasks (by name/title). */
export async function GET(request: Request): Promise<Response> {
  try {
    await getCurrentUser();
  } catch {
    return Response.json({ projects: [], tasks: [] }, { status: 401 });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 1) return Response.json({ projects: [], tasks: [] });

  const [projects, tasks] = await Promise.all([
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
  ]);
  return Response.json({ projects, tasks });
}
