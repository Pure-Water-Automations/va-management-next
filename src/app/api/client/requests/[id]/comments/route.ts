import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientGuard } from "../../../../_guard";
import { z } from "zod";

const CommentSchema = z.object({ body: z.string().min(1).max(2000) });

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await clientGuard();
  if ("error" in g) return g.error;
  const { id } = await params;

  const request = await db.clientTaskRequest.findFirst({
    where: { id, clientOrganizationId: g.orgId },
    select: { id: true, assignedTaskId: true, title: true },
  });
  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!request.assignedTaskId) {
    return NextResponse.json({ error: "Request not yet assigned to a task" }, { status: 422 });
  }

  const body = await req.json();
  const parsed = CommentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const comment = await db.taskComment.create({
    data: {
      taskId: request.assignedTaskId,
      authorId: g.user.id,
      body: parsed.data.body,
      visibility: "CLIENT_VISIBLE",
    },
    select: { id: true },
  });

  // Notify assigned Team Lead
  const task = await db.task.findUnique({
    where: { id: request.assignedTaskId },
    select: { assignedToId: true },
  });
  if (task?.assignedToId) {
    await db.notification.create({
      data: {
        userId: task.assignedToId,
        type: "client_comment",
        body: `Client replied on request: "${request.title}"`,
        link: `/hr/requests/${id}`,
      },
    });
  }

  return NextResponse.json({ id: comment.id }, { status: 201 });
}
