import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { canManageTasks, AuthorizationError } from "@/lib/auth/roles";
import { canUserActOnTask } from "@/lib/services/tasks";
import { notifyMentions } from "@/lib/inbox";
import type { Role, CommentVisibility } from "@prisma/client";
import { parseCommentVisibility } from "@/lib/client-portal/permissions";

export async function addTaskComment(
  actorId: string,
  actorRole: Role,
  taskId: string,
  body: string,
) {
  if (!body.trim()) throw new Error("Comment body cannot be empty");

  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { assignedToId: true, assignedById: true, title: true },
  });

  if (!canUserActOnTask(actorId, actorRole, task)) {
    throw new AuthorizationError("You are not allowed to comment on this task");
  }

  const comment = await db.taskComment.create({
    data: { taskId, authorId: actorId, body: body.trim() },
    include: { author: { select: { id: true, name: true } } },
  });

  await logActivity({
    source: "comment_action",
    eventType: "task_comment_added",
    severity: "info",
    summary: `Comment added on task "${task.title}".`,
  });

  await notifyMentions(comment.body, `/hr/tasks/${taskId}`, comment.author.name ?? "Someone");

  return comment;
}

export async function addProjectComment(
  actorId: string,
  actorRole: Role,
  projectId: string,
  body: string,
  rawVisibility?: string,
) {
  if (!canManageTasks(actorRole)) {
    throw new AuthorizationError("Only team managers can post project notes");
  }
  if (!body.trim()) throw new Error("Comment body cannot be empty");

  const visibility: CommentVisibility = parseCommentVisibility(rawVisibility);

  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { name: true },
  });

  const comment = await db.projectComment.create({
    data: { projectId, authorId: actorId, body: body.trim(), visibility },
    include: { author: { select: { id: true, name: true } } },
  });

  await logActivity({
    source: "comment_action",
    eventType: "project_comment_added",
    severity: "info",
    summary: `Note added on project "${project.name}".`,
  });

  await notifyMentions(comment.body, `/hr/projects/${projectId}`, comment.author.name ?? "Someone");

  return comment;
}
