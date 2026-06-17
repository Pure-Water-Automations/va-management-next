import { action } from "@/lib/api";
import { updateProject } from "@/lib/actions/projects";
import { canManageProjects } from "@/lib/auth/roles";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(
    async ({ user, body }) => {
      const { id } = await params;
      return updateProject(user.id, user.role, id, body);
    },
    { allow: (r) => canManageProjects(r) },
  )(request);
}
