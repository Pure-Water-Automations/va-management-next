"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/access";
import type { Role } from "@prisma/client";

const ROLES: Role[] = [
  "HR_MANAGER",
  "PEOPLE_OPS",
  "TEAM_LEAD",
  "BOOKKEEPER",
  "RECRUITER",
  "SENIOR_VA",
  "VA",
];

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user.isAdmin) throw new Error("Forbidden");
}

export async function createUser(data: {
  email: string;
  name: string;
  role: Role;
  isAdmin: boolean;
}) {
  await requireAdmin();
  const email = data.email.trim().toLowerCase();
  if (!email) throw new Error("Email is required");
  if (!ROLES.includes(data.role)) throw new Error("Invalid role");
  // Link the login to its VA record when the email matches one — Va.email == User.email
  // is how the VA console resolves a login to its profile. Without this, a VA login is
  // never recognised as a VA: no dashboard, and delegated tasks never show up.
  const va = await db.va.findUnique({ where: { email }, select: { vaId: true } });
  await db.user.create({
    data: {
      email,
      name: data.name.trim() || undefined,
      role: data.role,
      isAdmin: data.isAdmin,
      active: true,
      ...(va ? { vaId: va.vaId } : {}),
    },
  });
  revalidatePath("/admin/users");
}

export async function updateUserRole(id: string, role: Role) {
  await requireAdmin();
  if (!ROLES.includes(role)) throw new Error("Invalid role");
  await db.user.update({ where: { id }, data: { role } });
  revalidatePath("/admin/users");
}

export async function updateUserName(id: string, name: string) {
  await requireAdmin();
  await db.user.update({ where: { id }, data: { name: name.trim() || null } });
  revalidatePath("/admin/users");
}

export async function setUserActive(id: string, active: boolean) {
  await requireAdmin();
  await db.user.update({ where: { id }, data: { active } });
  revalidatePath("/admin/users");
}

export async function setUserAdmin(id: string, isAdmin: boolean) {
  await requireAdmin();
  await db.user.update({ where: { id }, data: { isAdmin } });
  revalidatePath("/admin/users");
}
