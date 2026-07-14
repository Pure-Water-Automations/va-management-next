import { db } from "@/lib/db";

export type WhiteboardListItem = Awaited<ReturnType<typeof listProjectWhiteboards>>[number];
export type WhiteboardDetail = NonNullable<Awaited<ReturnType<typeof getWhiteboard>>>;

/** Board summaries for a project (no canvas payload) — used on the project detail page. */
export async function listProjectWhiteboards(projectId: string) {
  return db.projectWhiteboard.findMany({
    where: { projectId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      updatedAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
}

/** One board with its full canvas `data` document + parent project name/client. */
export async function getWhiteboard(id: string) {
  return db.projectWhiteboard.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true, client: true } },
    },
  });
}
