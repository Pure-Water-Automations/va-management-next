import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { clientGuard } from "../../../_guard";
import { z } from "zod";

const CreateSchema = z.object({ body: z.string().min(1).max(2000) });

/** Client posts a project comment — always CLIENT_VISIBLE, scoped to their org. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const g = await clientGuard();
  if ("error" in g) return g.error;
  const { id: projectId } = await ctx.params;

  const project = await db.project.findFirst({
    where: { id: projectId, clientOrganizationId: g.orgId },
    select: { id: true, name: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const parsed = CreateSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const comment = await db.projectComment.create({
    data: {
      projectId,
      authorId: g.user.id,
      body: parsed.data.body.trim(),
      visibility: "CLIENT_VISIBLE",
    },
    select: { id: true },
  });

  const teamUsers = await db.user.findMany({
    where: { role: { in: ["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD"] }, active: true },
    select: { id: true },
  });
  await db.notification.createMany({
    data: teamUsers.map((u) => ({
      userId: u.id,
      type: "client_comment_new",
      body: `Client comment on "${project.name}"`,
      link: `/hr/projects/${projectId}`,
    })),
  });

  return NextResponse.json({ id: comment.id }, { status: 201 });
}
