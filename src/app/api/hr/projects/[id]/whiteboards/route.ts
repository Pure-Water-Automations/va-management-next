import { action } from "@/lib/api";
import { canManageTasks } from "@/lib/auth/roles";
import { createWhiteboard } from "@/lib/actions/whiteboards";

// Create a whiteboard on a project. manageTasks-gated (same authority as adding a
// task to a project); createWhiteboard validates the project exists.
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(
    async ({ user, body }) => {
      const { id } = await params;
      return createWhiteboard(user.id, id, typeof body.title === "string" ? body.title : undefined);
    },
    { allow: (r) => canManageTasks(r) },
  )(request);
}
