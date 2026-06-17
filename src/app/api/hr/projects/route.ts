import { action } from "@/lib/api";
import { createProject, type CreateProjectInput } from "@/lib/actions/projects";
import { canManageProjects } from "@/lib/auth/roles";

export const POST = action(
  async ({ user, body }) => createProject(user.id, user.role, body as CreateProjectInput),
  { allow: (r) => canManageProjects(r) },
);
