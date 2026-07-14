import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AuthorizationError } from "@/lib/auth/roles";
import { canUserDelegateProjects } from "@/lib/auth/delegation";
import { pushProjectStatusSafe } from "@/lib/notion-engine";
import type { Role, ProjectStatus, ProjectType, Priority } from "@prisma/client";

export type CreateProjectInput = {
  name: unknown;
  description?: unknown;
  status?: unknown;
  type?: unknown;
  priority?: unknown;
  client?: unknown;
  ownerId?: unknown;
  dueDate?: unknown;
  links?: unknown;
};

export type UpdateProjectInput = Partial<CreateProjectInput>;

function requireText(val: unknown, field: string): string {
  if (typeof val !== "string" || !val.trim()) throw new Error(`${field} is required`);
  return val.trim();
}
function optionalText(val: unknown): string | undefined {
  return typeof val === "string" && val.trim() ? val.trim() : undefined;
}
function optionalDate(val: unknown): Date | undefined {
  if (!val) return undefined;
  const d = new Date(val as string);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function createProject(
  actorId: string,
  actorRole: Role,
  input: CreateProjectInput,
) {
  if (!(await canUserDelegateProjects(actorId, actorRole)))
    throw new AuthorizationError("You don't have permission to create projects");

  const name = requireText(input.name, "name");
  const ownerId = optionalText(input.ownerId) ?? actorId;

  const project = await db.project.create({
    data: {
      name,
      description: optionalText(input.description),
      status: (optionalText(input.status) as ProjectStatus | undefined) ?? "Planning",
      type: (optionalText(input.type) as ProjectType | undefined) ?? "Project",
      priority: (optionalText(input.priority) as Priority | undefined) ?? "Medium",
      client: optionalText(input.client),
      ownerId,
      createdById: actorId,
      dueDate: optionalDate(input.dueDate),
      links: optionalText(input.links),
    },
    select: { id: true, name: true },
  });

  await logActivity({
    source: "project_action",
    eventType: "project_created",
    severity: "success",
    summary: `Project "${project.name}" created.`,
  });

  return project;
}

export async function updateProject(
  actorId: string,
  actorRole: Role,
  projectId: string,
  input: UpdateProjectInput,
) {
  if (!(await canUserDelegateProjects(actorId, actorRole)))
    throw new AuthorizationError("You don't have permission to update projects");

  const project = await db.project.update({
    where: { id: projectId },
    data: {
      ...(input.name !== undefined ? { name: requireText(input.name, "name") } : {}),
      ...(input.description !== undefined ? { description: optionalText(input.description) } : {}),
      ...(input.status !== undefined ? { status: optionalText(input.status) as ProjectStatus } : {}),
      ...(input.type !== undefined ? { type: optionalText(input.type) as ProjectType } : {}),
      ...(input.priority !== undefined ? { priority: optionalText(input.priority) as Priority } : {}),
      ...(input.client !== undefined ? { client: optionalText(input.client) } : {}),
      ...(input.ownerId !== undefined ? { ownerId: optionalText(input.ownerId) ?? actorId } : {}),
      ...(input.dueDate !== undefined ? { dueDate: optionalDate(input.dueDate) } : {}),
      ...(input.links !== undefined ? { links: optionalText(input.links) } : {}),
    },
    select: { id: true, name: true },
  });

  await logActivity({
    source: "project_action",
    eventType: "project_updated",
    severity: "info",
    summary: `Project "${project.name}" updated.`,
  });

  // Notion two-way sync (beta): mirror a status change to the linked Notion page.
  if (input.status !== undefined) pushProjectStatusSafe(project.id);

  return project;
}
