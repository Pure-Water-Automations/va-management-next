import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/access";
import { z } from "zod";

const CreateSchema = z.object({
  name: z.string().min(1).max(200),
  slug: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/, "slug must be lowercase letters, numbers, hyphens"),
  notionId: z.string().optional().nullable(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !user.isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  const parsed = CreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const org = await db.clientOrganization.create({
    data: parsed.data,
    select: { id: true, slug: true },
  });

  return NextResponse.json(org, { status: 201 });
}
