import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AuthorizationError, canManageTasks, canManageProjects } from "@/lib/auth/roles";
import { parseFieldType, parseOptions, validateFieldValue } from "@/lib/services/fields";
import type { Role } from "@prisma/client";

export type CreateFieldDefInput = {
  name: string;
  type?: string;
  projectId?: string;
  options?: unknown;
  clientVisible?: boolean;
};

export async function createFieldDef(actorId: string, actorRole: Role, input: CreateFieldDefInput) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("You don't have permission to add fields");

  const name = input.name.trim();
  if (!name) throw new Error("Field name is required");
  const type = parseFieldType(input.type ?? "TEXT");
  const options = parseOptions(input.options);
  const projectId = input.projectId?.trim() || null;

  if (projectId) {
    await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true } });
  }

  // The composite unique doesn't catch duplicates when projectId is NULL
  // (Postgres treats NULLs as distinct), so enforce name uniqueness here —
  // case-insensitively, and against global fields too for project scope.
  const dup = await db.fieldDef.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      OR: projectId ? [{ projectId }, { projectId: null }] : [{ projectId: null }],
    },
    select: { id: true },
  });
  if (dup) throw new Error(`A field named "${name}" already exists`);

  const order = await db.fieldDef.count({ where: { projectId } });

  const def = await db.fieldDef.create({
    data: {
      name,
      type,
      projectId,
      options: options.length ? options : undefined,
      clientVisible: input.clientVisible === true,
      order,
      createdById: actorId,
    },
  });

  await logActivity({
    source: "field_action",
    eventType: "field_created",
    severity: "success",
    summary: `Field "${def.name}" (${def.type}) added${projectId ? " to project" : " globally"}.`,
  });

  return def;
}

export type SetFieldValueInput = {
  fieldId: string;
  taskId?: string;
  projectId?: string;
  value: string;
};

/** Set (or clear, when value is empty) a field's value on a task or a project. */
export async function setFieldValue(actorId: string, actorRole: Role, input: SetFieldValueInput) {
  if (!canManageTasks(actorRole))
    throw new AuthorizationError("You don't have permission to edit fields");

  const taskId = input.taskId?.trim() || null;
  const projectId = input.projectId?.trim() || null;
  if (!taskId === !projectId) throw new Error("Provide exactly one of taskId / projectId");

  const field = await db.fieldDef.findUniqueOrThrow({ where: { id: input.fieldId } });
  const options = parseOptions(field.options);

  // A project-scoped field only applies inside its own project.
  if (field.projectId) {
    if (taskId) {
      const task = await db.task.findUniqueOrThrow({
        where: { id: taskId },
        select: { projectId: true },
      });
      if (task.projectId !== field.projectId)
        throw new Error(`Field "${field.name}" is scoped to a different project`);
    } else if (projectId !== field.projectId) {
      throw new Error(`Field "${field.name}" is scoped to a different project`);
    }
  } else if (projectId) {
    await db.project.findUniqueOrThrow({ where: { id: projectId }, select: { id: true } });
  }

  const raw = input.value.trim();
  const target = taskId ? { taskId } : { projectId };

  if (!raw) {
    await db.fieldValue.deleteMany({ where: { fieldId: field.id, ...target } });
    return { fieldId: field.id, value: null };
  }

  const value = validateFieldValue(field.type, options, raw);

  const saved = taskId
    ? await db.fieldValue.upsert({
        where: { fieldId_taskId: { fieldId: field.id, taskId } },
        create: { fieldId: field.id, taskId, value },
        update: { value },
      })
    : await db.fieldValue.upsert({
        where: { fieldId_projectId: { fieldId: field.id, projectId: projectId! } },
        create: { fieldId: field.id, projectId, value },
        update: { value },
      });

  await logActivity({
    source: "field_action",
    eventType: "field_value_set",
    severity: "info",
    summary: `Field "${field.name}" set to "${value}" on a ${taskId ? "task" : "project"}.`,
  });

  return { fieldId: field.id, value: saved.value };
}

export async function deleteFieldDef(actorId: string, actorRole: Role, fieldId: string) {
  if (!canManageProjects(actorRole))
    throw new AuthorizationError("You don't have permission to delete fields");

  const def = await db.fieldDef.delete({ where: { id: fieldId } }); // values cascade

  await logActivity({
    source: "field_action",
    eventType: "field_deleted",
    severity: "warning",
    summary: `Field "${def.name}" deleted (all its values removed).`,
  });

  return { id: def.id };
}
