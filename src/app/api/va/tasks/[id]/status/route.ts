import type { TaskStatus } from "@prisma/client";
import { action, str } from "@/lib/api";
import { updateTaskStatus } from "@/lib/actions/tasks";

// The action wrapper handles identity + JSON parse + audit; updateTaskStatus
// enforces per-task permission internally, so any authenticated role may call.
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(async ({ user, body }) => {
    const { id } = await params;
    const status = str(body, "status") as TaskStatus;
    return updateTaskStatus(user.id, user.role, id, status);
  })(request);
}
