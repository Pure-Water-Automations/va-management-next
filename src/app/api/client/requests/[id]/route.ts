import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientGuard } from "../../_guard";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const g = await clientGuard();
  if ("error" in g) return g.error;
  const { id } = await params;

  const request = await db.clientTaskRequest.findFirst({
    where: { id, clientOrganizationId: g.orgId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      priorityPreference: true,
      dueDatePreference: true,
      fileReference: true,
      declineReason: true,
      createdAt: true,
      submittedBy: { select: { name: true, email: true } },
      assignedTask: {
        select: {
          id: true,
          title: true,
          status: true,
          assignedTo: { select: { name: true } },
          comments: {
            where: { visibility: "CLIENT_VISIBLE" },
            select: {
              id: true,
              body: true,
              createdAt: true,
              author: { select: { name: true } },
            },
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ request });
}
