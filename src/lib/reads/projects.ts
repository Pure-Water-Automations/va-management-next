import { db } from "@/lib/db";
import { computeProjectProgress } from "@/lib/services/tasks";

export type ProjectListItem = Awaited<ReturnType<typeof getProjectsList>>[number];
export type ProjectDetail = Awaited<ReturnType<typeof getProjectDetail>>;
export type ActivityFeedItem = Awaited<ReturnType<typeof getProjectActivityFeed>>[number];

export async function getProjectsList() {
  const projects = await db.project.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      tasks: { select: { status: true } },
    },
  });
  return projects.map((p) => ({
    ...p,
    progress: computeProjectProgress(p.tasks),
    taskCount: p.tasks.length,
    openTaskCount: p.tasks.filter((t) => t.status !== "Done").length,
  }));
}

export async function getProjectDetail(projectId: string) {
  return db.project.findUnique({
    where: { id: projectId },
    include: {
      owner: { select: { id: true, name: true, email: true } },
      createdBy: { select: { id: true, name: true } },
      tasks: {
        orderBy: { createdAt: "asc" },
        include: {
          assignedTo: { select: { id: true, name: true } },
          assignedBy: { select: { id: true, name: true } },
          comments: {
            orderBy: { createdAt: "asc" },
            include: { author: { select: { id: true, name: true } } },
          },
        },
      },
      comments: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { id: true, name: true } } },
      },
    },
  });
}

export async function getProjectActivityFeed(projectId: string) {
  const [taskComments, projectComments, recentStatusChanges] = await Promise.all([
    db.taskComment.findMany({
      where: { task: { projectId } },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        author: { select: { name: true } },
        task: { select: { title: true } },
      },
    }),
    db.projectComment.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { author: { select: { name: true } } },
    }),
    db.task.findMany({
      where: { projectId },
      orderBy: { updatedAt: "desc" },
      take: 20,
      select: {
        id: true,
        title: true,
        status: true,
        updatedAt: true,
        assignedTo: { select: { name: true } },
      },
    }),
  ]);

  type FeedItem = { id: string; type: string; summary: string; at: Date };
  const items: FeedItem[] = [
    ...taskComments.map((c) => ({
      id: `tc-${c.id}`,
      type: "task_comment",
      summary: `${c.author.name ?? "Someone"} commented on "${c.task.title}": ${c.body.slice(0, 80)}`,
      at: c.createdAt,
    })),
    ...projectComments.map((c) => ({
      id: `pc-${c.id}`,
      type: "project_comment",
      summary: `${c.author.name ?? "Someone"} posted a note: ${c.body.slice(0, 80)}`,
      at: c.createdAt,
    })),
    ...recentStatusChanges.map((t) => ({
      id: `ts-${t.id}`,
      type: "task_status",
      summary: `"${t.title}" is now ${t.status} (${t.assignedTo.name ?? "unassigned"})`,
      at: t.updatedAt,
    })),
  ];

  return items.sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 30);
}
