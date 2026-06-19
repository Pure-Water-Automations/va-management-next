import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientGuard } from "../../../_guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await clientGuard();
  if ("error" in g) return g.error;
  const { id: projectId } = await params;

  // Verify project belongs to this org
  const project = await db.project.findFirst({
    where: { id: projectId, clientOrganizationId: g.orgId },
    select: { id: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const tasks = await db.task.findMany({
    where: {
      projectId,
      clientTaskRequest: { clientOrganizationId: g.orgId },
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      dueDate: true,
      assignedTo: { select: { name: true } },
      _count: { select: { comments: { where: { visibility: "CLIENT_VISIBLE" } } } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ tasks });
}
