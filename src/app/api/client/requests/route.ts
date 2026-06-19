import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientGuard } from "../_guard";
import { z } from "zod";

const CreateSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1).max(2000),
  priorityPreference: z.enum(["Low", "Medium", "High"]).optional(),
  dueDatePreference: z.string().datetime().optional().nullable(),
  fileReference: z.string().max(500).optional().nullable(),
});

export async function GET() {
  const g = await clientGuard();
  if ("error" in g) return g.error;

  const requests = await db.clientTaskRequest.findMany({
    where: { clientOrganizationId: g.orgId },
    select: {
      id: true,
      title: true,
      status: true,
      priorityPreference: true,
      dueDatePreference: true,
      createdAt: true,
      submittedBy: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ requests });
}

export async function POST(req: Request) {
  const g = await clientGuard();
  if ("error" in g) return g.error;

  const body = await req.json();
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const request = await db.clientTaskRequest.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      priorityPreference: parsed.data.priorityPreference ?? "Medium",
      dueDatePreference: parsed.data.dueDatePreference ? new Date(parsed.data.dueDatePreference) : null,
      fileReference: parsed.data.fileReference ?? null,
      submittedById: g.user.id,
      clientOrganizationId: g.orgId,
    },
    select: { id: true },
  });

  // Notify team leads / HR
  const teamUsers = await db.user.findMany({
    where: { role: { in: ["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD"] }, active: true },
    select: { id: true },
  });
  await db.notification.createMany({
    data: teamUsers.map((u) => ({
      userId: u.id,
      type: "client_request_new",
      body: `New client request: "${parsed.data.title}"`,
      link: `/hr/requests`,
    })),
  });

  return NextResponse.json({ id: request.id }, { status: 201 });
}
