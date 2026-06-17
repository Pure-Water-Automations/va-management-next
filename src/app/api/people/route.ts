import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";

/** People suggestions for @mentions in task/project comments. Identity-gated. */
export async function GET(request: Request): Promise<Response> {
  try {
    await getCurrentUser();
  } catch {
    return Response.json({ people: [] }, { status: 401 });
  }
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const where = q
    ? { active: true, name: { contains: q, mode: "insensitive" as const } }
    : { active: true, name: { not: null } };
  const people = await db.user.findMany({
    where,
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
    take: 8,
  });
  return Response.json({ people });
}
