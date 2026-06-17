import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import {
  canManageProjects,
  canManageTasks,
  AuthorizationError,
} from "@/lib/auth/roles";
import type { Role, ProjectType, Priority, TaskStrategy } from "@prisma/client";

function requireText(val: unknown, field: string): string {
  if (typeof val !== "string" || !val.trim()) throw new Error(`${field} is required`);
  return val.trim();
}
function optionalText(val: unknown): string | undefined {
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}

export type TemplateTaskEntry = { title: string; strategy: TaskStrategy; priority: Priority };

/** Normalize a loosely-typed array of task rows from a template payload. */
function normalizeTasks(val: unknown): TemplateTaskEntry[] {
  if (!Array.isArray(val)) return [];
  const out: TemplateTaskEntry[] = [];
  for (const raw of val) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const title = optionalText(r.title);
    if (!title) continue;
    out.push({
      title,
      strategy: (optionalText(r.strategy) as TaskStrategy | undefined) ?? "Create",
      priority: (optionalText(r.priority) as Priority | undefined) ?? "Medium",
    });
  }
  return out;
}

// ── Project templates ────────────────────────────────────────────────────────

export type CreateProjectTemplateInput = {
  name: unknown;
  description?: unknown;
  type?: unknown;
  priority?: unknown;
  tasks?: unknown;
};

export async function createProjectTemplate(
  actorId: string,
  actorRole: Role,
  input: CreateProjectTemplateInput,
) {
  if (!canManageProjects(actorRole))
    throw new AuthorizationError("Only HR managers and team leads can create project templates");

  const name = requireText(input.name, "name");
  const tasks = normalizeTasks(input.tasks);

  const template = await db.projectTemplate.create({
    data: {
      name,
      description: optionalText(input.description),
      type: (optionalText(input.type) as ProjectType | undefined) ?? "Project",
      priority: (optionalText(input.priority) as Priority | undefined) ?? "Medium",
      tasksJson: tasks,
      createdById: actorId,
    },
    select: { id: true, name: true },
  });

  await logActivity({
    source: "template_action",
    eventType: "project_template_created",
    severity: "success",
    summary: `Project template "${template.name}" created.`,
  });

  return template;
}

export async function deleteProjectTemplate(actorId: string, actorRole: Role, id: string) {
  if (!canManageProjects(actorRole))
    throw new AuthorizationError("Only HR managers and team leads can delete project templates");

  const templateId = requireText(id, "id");
  const template = await db.projectTemplate.delete({
    where: { id: templateId },
    select: { id: true, name: true },
  });

  await logActivity({
    source: "template_action",
    eventType: "project_template_deleted",
    severity: "info",
    summary: `Project template "${template.name}" deleted.`,
  });

  return template;
}

/** Create a real Project (+ its tasks) from a project template. */
export async function instantiateProjectTemplate(
  actorId: string,
  actorRole: Role,
  id: string,
  input: { name?: unknown } = {},
) {
  if (!canManageProjects(actorRole))
    throw new AuthorizationError("Only HR managers and team leads can use project templates");

  const templateId = requireText(id, "id");
  const template = await db.projectTemplate.findUniqueOrThrow({
    where: { id: templateId },
  });

  const name = optionalText(input.name) ?? template.name;

  const project = await db.project.create({
    data: {
      name,
      description: template.description,
      status: "Planning",
      type: template.type,
      priority: template.priority,
      ownerId: actorId,
      createdById: actorId,
    },
    select: { id: true, name: true },
  });

  const tasks = normalizeTasks(template.tasksJson);
  for (const entry of tasks) {
    await db.task.create({
      data: {
        title: entry.title,
        strategy: entry.strategy,
        priority: entry.priority,
        status: "NotStarted",
        projectId: project.id,
        assignedToId: actorId,
        assignedById: actorId,
      },
    });
  }

  await logActivity({
    source: "template_action",
    eventType: "project_template_instantiated",
    severity: "success",
    summary: `Project "${project.name}" created from template "${template.name}" with ${tasks.length} task(s).`,
  });

  return { projectId: project.id };
}

// ── Task templates ───────────────────────────────────────────────────────────

export type CreateTaskTemplateInput = {
  name: unknown;
  title: unknown;
  instructions?: unknown;
  strategy?: unknown;
  priority?: unknown;
};

export async function createTaskTemplate(
  actorId: string,
  actorRole: Role,
  input: CreateTaskTemplateInput,
) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("Only team leads and senior VAs can create task templates");

  const name = requireText(input.name, "name");
  const title = requireText(input.title, "title");

  const template = await db.taskTemplate.create({
    data: {
      name,
      title,
      instructions: optionalText(input.instructions),
      strategy: (optionalText(input.strategy) as TaskStrategy | undefined) ?? "Create",
      priority: (optionalText(input.priority) as Priority | undefined) ?? "Medium",
      createdById: actorId,
    },
    select: { id: true, name: true },
  });

  await logActivity({
    source: "template_action",
    eventType: "task_template_created",
    severity: "success",
    summary: `Task template "${template.name}" created.`,
  });

  return template;
}

export async function deleteTaskTemplate(actorId: string, actorRole: Role, id: string) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("Only team leads and senior VAs can delete task templates");

  const templateId = requireText(id, "id");
  const template = await db.taskTemplate.delete({
    where: { id: templateId },
    select: { id: true, name: true },
  });

  await logActivity({
    source: "template_action",
    eventType: "task_template_deleted",
    severity: "info",
    summary: `Task template "${template.name}" deleted.`,
  });

  return template;
}

/** Create a real Task from a task template, assigned to the actor. */
export async function instantiateTaskTemplate(actorId: string, actorRole: Role, id: string) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("Only team leads and senior VAs can use task templates");

  const templateId = requireText(id, "id");
  const template = await db.taskTemplate.findUniqueOrThrow({
    where: { id: templateId },
  });

  const task = await db.task.create({
    data: {
      title: template.title,
      instructions: template.instructions,
      strategy: template.strategy,
      priority: template.priority,
      status: "NotStarted",
      assignedToId: actorId,
      assignedById: actorId,
    },
    select: { id: true, title: true },
  });

  await logActivity({
    source: "template_action",
    eventType: "task_template_instantiated",
    severity: "success",
    summary: `Task "${task.title}" created from template "${template.name}".`,
  });

  return { taskId: task.id };
}
