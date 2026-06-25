import { action } from "@/lib/api";
import { updateTask } from "@/lib/actions/tasks";
import { canManageTasks } from "@/lib/auth/roles";

// The action wrapper does not receive params, so close over them and read the
// id after awaiting. updateTask enforces canManageTasks internally too.
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(
    async ({ actor, body }) => {
      const { id } = await params;
      return updateTask(actor.id, actor.role, id, body);
    },
    { allow: (r) => canManageTasks(r) },
  )(request);
}
