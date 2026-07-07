import { db } from "@/lib/db";
import { parseOptions } from "@/lib/services/fields";
import type { FieldType } from "@prisma/client";

export type ProjectFieldPill = {
  id: string;
  name: string;
  type: FieldType;
  options: string[];
  clientVisible: boolean;
  value: string | null;
};

/** Field pills for a project hub header: global + project-scoped defs, with the project-level value. */
export async function getProjectFieldPills(projectId: string): Promise<ProjectFieldPill[]> {
  const defs = await db.fieldDef.findMany({
    where: { OR: [{ projectId }, { projectId: null }] },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    include: { values: { where: { projectId } } },
  });
  return defs.map((d) => ({
    id: d.id,
    name: d.name,
    type: d.type,
    options: parseOptions(d.options),
    clientVisible: d.clientVisible,
    value: d.values[0]?.value ?? null,
  }));
}

export type TaskFieldColumns = {
  defs: Omit<ProjectFieldPill, "value">[];
  /** taskId → fieldId → value */
  valuesByTask: Record<string, Record<string, string>>;
};

/**
 * Custom columns for a task table. Project view = global + that project's
 * fields; the global tasks console shows global fields only (a per-project
 * field would be an empty column for every other project's rows).
 */
export async function getTaskFieldColumns(
  projectId: string | null,
  taskIds: string[],
): Promise<TaskFieldColumns> {
  const defs = await db.fieldDef.findMany({
    where: projectId ? { OR: [{ projectId }, { projectId: null }] } : { projectId: null },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  const values =
    taskIds.length && defs.length
      ? await db.fieldValue.findMany({
          where: { taskId: { in: taskIds }, fieldId: { in: defs.map((d) => d.id) } },
          select: { taskId: true, fieldId: true, value: true },
        })
      : [];

  const valuesByTask: Record<string, Record<string, string>> = {};
  for (const v of values) {
    if (!v.taskId) continue;
    (valuesByTask[v.taskId] ??= {})[v.fieldId] = v.value;
  }

  return {
    defs: defs.map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      options: parseOptions(d.options),
      clientVisible: d.clientVisible,
    })),
    valuesByTask,
  };
}
