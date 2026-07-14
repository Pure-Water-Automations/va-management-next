import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, isAllAccess } from "@/lib/auth/access";
import { z } from "zod";

const AddMemberSchema = z.object({
  email: z.string().email(),
  role: z.enum(["CLIENT_ADMIN", "CLIENT_MEMBER"]).optional().default("CLIENT_MEMBER"),
});

export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (user.role !== "HR_MANAGER" && user.role !== "PEOPLE_OPS" && !isAllAccess(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { slug } = await params;

  const org = await db.clientOrganization.findUnique({ where: { slug }, select: { id: true } });
  if (!org) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Parse body once — either form-urlencoded (browser <form> post) or JSON (fetch).
  const contentType = req.headers.get("content-type") ?? "";
  const isFormPost = contentType.includes("application/x-www-form-urlencoded");
  let email: string;
  let role: "CLIENT_ADMIN" | "CLIENT_MEMBER" = "CLIENT_MEMBER";

  if (isFormPost) {
    const text = await req.text();
    const fd = new URLSearchParams(text);
    email = fd.get("email") ?? "";
    const rawRole = fd.get("role");
    if (rawRole === "CLIENT_ADMIN") role = "CLIENT_ADMIN";
    // Validate email format from form data
    const emailCheck = z.string().email().safeParse(email);
    if (!emailCheck.success) return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  } else {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    const parsed = AddMemberSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    ({ email, role } = parsed.data);
  }

  if (!email) return NextResponse.json({ error: "Email required" }, { status: 400 });

  // Find or create user
  let member = await db.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
  if (!member) {
    member = await db.user.create({
      data: {
        email: email.toLowerCase(),
        role,
        active: true,
      },
      select: { id: true },
    });
  } else {
    // Only update role if user is already a client role — don't downgrade internal users
    const existingUser = await db.user.findUnique({
      where: { id: member.id },
      select: { role: true },
    });
    if (existingUser?.role === "CLIENT_ADMIN" || existingUser?.role === "CLIENT_MEMBER") {
      await db.user.update({
        where: { id: member.id },
        data: { role, active: true },
      });
    }
  }

  await db.clientMembership.upsert({
    where: { userId_clientOrganizationId: { userId: member.id, clientOrganizationId: org.id } },
    create: { userId: member.id, clientOrganizationId: org.id },
    update: {},
  });

  // A browser <form> post navigates to this URL, so returning JSON left the user
  // staring at a raw `{"ok":true}` page (tester report: "add-member raw-JSON page").
  // Send them back to the org page with a 303 (GET) instead. JSON callers still get JSON.
  if (isFormPost) {
    return NextResponse.redirect(new URL(`/hr/clients/${slug}`, req.url), 303);
  }
  return NextResponse.json({ ok: true });
}
