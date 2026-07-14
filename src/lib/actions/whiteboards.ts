import { db } from "@/lib/db";
import type { Role } from "@prisma/client";
import { createTask } from "@/lib/actions/tasks";

/**
 * Create a blank whiteboard on a project. Returns the new board id so the client
 * can navigate straight into the editor.
 */
export async function createWhiteboard(
  actorId: string,
  projectId: string,
  title?: string,
) {
  const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("Project not found");
  const board = await db.projectWhiteboard.create({
    data: {
      projectId,
      title: (title ?? "").trim() || "Untitled board",
      createdById: actorId,
    },
    select: { id: true },
  });
  return { id: board.id };
}

/**
 * Persist the full canvas document (and optional title rename). The client owns the
 * document shape; we store it verbatim as JSON.
 */
export async function saveWhiteboard(
  boardId: string,
  data: unknown,
  title?: string,
) {
  const board = await db.projectWhiteboard.findUnique({ where: { id: boardId }, select: { id: true } });
  if (!board) throw new Error("Whiteboard not found");
  await db.projectWhiteboard.update({
    where: { id: boardId },
    data: {
      data: (data ?? undefined) as never,
      ...(typeof title === "string" && title.trim() ? { title: title.trim() } : {}),
    },
  });
  return { ok: true };
}

export type ConvertTaskInput = {
  title: unknown;
  assignedToId: unknown;
  dueDate?: unknown;
  priority?: unknown;
};

/**
 * Promote selected whiteboard notes into real Tasks on the board's project. Each
 * task goes through the normal createTask path, so assignees get the standard
 * assignment email + WhatsApp notification, exactly like a delegated task.
 */
export async function convertWhiteboardToTasks(
  actorId: string,
  actorRole: Role,
  boardId: string,
  tasks: ConvertTaskInput[],
) {
  const board = await db.projectWhiteboard.findUnique({
    where: { id: boardId },
    select: { projectId: true },
  });
  if (!board) throw new Error("Whiteboard not found");
  if (!Array.isArray(tasks) || tasks.length === 0) throw new Error("No tasks to convert");

  const created: { id: string; title: string }[] = [];
  for (const t of tasks) {
    const title = typeof t.title === "string" ? t.title.trim() : "";
    if (!title) continue;
    const task = await createTask(actorId, actorRole, {
      title,
      assignedToId: t.assignedToId,
      projectId: board.projectId,
      strategy: "Create",
      priority: typeof t.priority === "string" ? t.priority : "Medium",
      dueDate: typeof t.dueDate === "string" && t.dueDate ? t.dueDate : undefined,
    });
    created.push({ id: task.id, title: task.title });
  }

  return { projectId: board.projectId, count: created.length, tasks: created };
}
