import { action } from "@/lib/api";
import { canManageTasks } from "@/lib/auth/roles";
import { convertWhiteboardToTasks, type ConvertTaskInput } from "@/lib/actions/whiteboards";

// Promote selected whiteboard notes into real Tasks on the board's project. Each
// runs through createTask, which enforces delegation authority and fires the normal
// assignment notification (email + WhatsApp).
export function POST(request: Request, { params }: { params: Promise<{ boardId: string }> }) {
  return action(
    async ({ user, body }) => {
      const { boardId } = await params;
      const tasks = Array.isArray(body.tasks) ? (body.tasks as ConvertTaskInput[]) : [];
      return convertWhiteboardToTasks(user.id, user.role, boardId, tasks);
    },
    { allow: (r) => canManageTasks(r) },
  )(request);
}
