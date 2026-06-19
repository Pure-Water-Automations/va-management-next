import { Prisma } from "@prisma/client";
import { action, str } from "@/lib/api";
import { isGateReviewer } from "@/lib/auth/roles";
import { db } from "@/lib/db";

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return action(
    async ({ body }) => {
      const { id } = await params;
      const taskId = str(body, "taskId");

      const existing = await db.clientTaskRequest.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!existing) throw new Error("Request not found");
      if (existing.status !== "READY_TO_ASSIGN") {
        throw new Error("Request must be accepted before linking a task");
      }

      const task = await db.task.findUnique({ where: { id: taskId }, select: { id: true } });
      if (!task) throw new Error("Task not found");

      try {
        const updated = await db.clientTaskRequest.update({
          where: { id },
          data: { assignedTaskId: taskId, status: "ASSIGNED" },
          select: { id: true, status: true, assignedTaskId: true },
        });
        return updated;
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
          throw new Error("That task is already linked to another request");
        }
        throw err;
      }
    },
    { allow: (r) => isGateReviewer(r) },
  )(request);
}
