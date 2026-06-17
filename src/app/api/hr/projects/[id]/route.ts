import { action } from "@/lib/api";
import { updateProject } from "@/lib/actions/projects";

// No role gate here: updateProject enforces tier-aware delegation authority itself.
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(async ({ user, body }) => {
    const { id } = await params;
    return updateProject(user.id, user.role, id, body);
  })(request);
}
