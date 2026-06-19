import { action, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(
    async ({ body }) => {
      const { id } = await params;
      const taskId = str(body, "taskId");

      // Validate that the task exists
      const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true } });
      if (!task) throw new Error("Task not found");

      const updated = await db.clientTaskRequest.update({
        where: { id },
        data: { assignedTaskId: taskId, status: "IN_PROGRESS" },
        select: { id: true, status: true, assignedTaskId: true },
      });
      return updated;
    },
    { allow: (r) => isGateReviewer(r) },
  )(request);
}
