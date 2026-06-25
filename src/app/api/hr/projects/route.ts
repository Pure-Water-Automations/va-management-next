import { action } from "@/lib/api";
import { createProject, type CreateProjectInput } from "@/lib/actions/projects";

// No role gate here: createProject enforces tier-aware delegation authority itself.
export const POST = action(
  async ({ actor, body }) => createProject(actor.id, actor.role, body as CreateProjectInput),
);
