import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientGuard } from "../_guard";

export async function GET() {
  const g = await clientGuard();
  if ("error" in g) return g.error;

  const projects = await db.project.findMany({
    where: { clientOrganizationId: g.orgId },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      priority: true,
      dueDate: true,
      owner: { select: { name: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ projects });
}
