import { action, str } from "@/lib/api";
import { AuthorizationError } from "@/lib/auth/roles";
import { canManageNotionForOrg } from "@/lib/auth/notion-access";
import { db } from "@/lib/db";
import { linkTask } from "@/lib/notion-engine";

// Push an existing task to Notion: create a linked page in the org's connected
// tasks database. Body: { taskId }.
export const POST = action(async ({ user, body }) => {
  const taskId = str(body, "taskId");
  const task = await db.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { clientOrganizationId: true, projectId: true },
  });
  let orgId = task.clientOrganizationId;
  if (!orgId && task.projectId) {
    const proj = await db.project.findUnique({ where: { id: task.projectId }, select: { clientOrganizationId: true } });
    orgId = proj?.clientOrganizationId ?? null;
  }
  if (!orgId) throw new Error("Task has no client organization");
  if (!(await canManageNotionForOrg(user, orgId))) throw new AuthorizationError("Not authorized for this client");
  return linkTask(taskId);
});
