import { action, str } from "@/lib/api";
import { AuthorizationError } from "@/lib/auth/roles";
import { canManageNotionForOrg } from "@/lib/auth/notion-access";
import { db } from "@/lib/db";
import { linkProject } from "@/lib/notion-engine";

// Push an existing project to Notion: create a linked page in the org's connected
// projects database. Body: { projectId }.
export const POST = action(async ({ user, body }) => {
  const projectId = str(body, "projectId");
  const project = await db.project.findUniqueOrThrow({
    where: { id: projectId },
    select: { clientOrganizationId: true },
  });
  if (!project.clientOrganizationId) throw new Error("Project has no client organization");
  if (!(await canManageNotionForOrg(user, project.clientOrganizationId)))
    throw new AuthorizationError("Not authorized for this client");
  return linkProject(projectId);
});
