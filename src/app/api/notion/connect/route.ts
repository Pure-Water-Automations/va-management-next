import { action, optStr } from "@/lib/api";
import { AuthorizationError } from "@/lib/auth/roles";
import { canManageNotionForOrg, resolveOrg } from "@/lib/auth/notion-access";
import { connectNotion } from "@/lib/notion-engine";

// Connect (or update) a client org's Notion sync. Validates the token + database
// schema and auto-builds the status maps. Body: { orgId|orgSlug, token,
// projectsDatabase?, tasksDatabase?, statusProperty? }.
export const POST = action(async ({ user, body }) => {
  const org = await resolveOrg(body);
  if (!org) throw new Error("Unknown client organization");
  if (!(await canManageNotionForOrg(user, org.id))) throw new AuthorizationError("Not authorized for this client");

  // token may be omitted — connectNotion reuses the stored OAuth/prior token.
  const token = optStr(body, "token");
  const projectsDatabase = optStr(body, "projectsDatabase");
  const tasksDatabase = optStr(body, "tasksDatabase");
  if (!projectsDatabase && !tasksDatabase) throw new Error("Provide a projects and/or tasks database link");

  return connectNotion({
    clientOrganizationId: org.id,
    token,
    projectsDatabase,
    tasksDatabase,
    statusProperty: optStr(body, "statusProperty"),
    createdByEmail: user.email,
  });
});
