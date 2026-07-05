import { action } from "@/lib/api";
import { updateTask } from "@/lib/actions/tasks";

// The action wrapper does not receive params, so close over them and read the
// id after awaiting. updateTask enforces delegation authority internally too.
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(
    async ({ user, body }) => {
      const { id } = await params;
      return updateTask(user.id, user.role, id, body);
    },
    { allowUser: (u) => u.caps.manageTasks },
  )(request);
}
