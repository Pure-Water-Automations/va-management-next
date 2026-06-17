import { action } from "@/lib/api";
import { createProject, type CreateProjectInput } from "@/lib/actions/projects";

// No role gate here: createProject enforces tier-aware delegation authority itself.
export const POST = action(
  async ({ user, body }) => createProject(user.id, user.role, body as CreateProjectInput),
);
