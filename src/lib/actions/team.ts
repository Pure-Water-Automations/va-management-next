/**
 * Team-structure mutations: who supervises whom (Va.supervisorVaId) and which
 * staff are assigned to which client (ClientAssignment). HR-gated.
 */
import type { Role, ClientTeamRole } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AuthorizationError } from "@/lib/auth/roles";

type Actor = { role: Role; isAdmin: boolean };

export function canManageTeam(actor: Actor): boolean {
  return actor.isAdmin || actor.role === "HR_MANAGER" || actor.role === "PEOPLE_OPS";
}
function assertCanManageTeam(actor: Actor): void {
  if (!canManageTeam(actor)) throw new AuthorizationError("Only HR can manage team assignments");
}

// ── Supervisor (reports-to) ──────────────────────────────────────────────────

export async function setVaSupervisor(actor: Actor, vaId: string, supervisorVaId: string | null) {
  assertCanManageTeam(actor);
  const id = (vaId || "").trim();
  if (!id) throw new Error("vaId is required");
  const sup = supervisorVaId?.trim() || null;
  if (sup === id) throw new Error("A VA cannot be their own supervisor.");

  const va = await db.va.findUnique({ where: { vaId: id }, select: { vaId: true, name: true } });
  if (!va) throw new Error("VA not found");
  let supName: string | null = null;
  if (sup) {
    const supervisor = await db.va.findUnique({ where: { vaId: sup }, select: { name: true } });
    if (!supervisor) throw new Error("Supervisor not found");
    supName = supervisor.name;
  }

  await db.va.update({ where: { vaId: id }, data: { supervisorVaId: sup } });
  await logActivity({
    source: "hr_action",
    eventType: "supervisor_set",
    severity: "info",
    vaId: id,
    summary: sup ? `${va.name}'s supervisor set to ${supName}.` : `${va.name}'s supervisor cleared.`,
  });
  return { vaId: id, supervisorVaId: sup };
}

// ── Client → team assignment ─────────────────────────────────────────────────

export async function assignToClient(actor: Actor, clientOrganizationId: string, userId: string, role: ClientTeamRole) {
  assertCanManageTeam(actor);
  if (!clientOrganizationId || !userId) throw new Error("Missing client or user");
  const [org, u] = await Promise.all([
    db.clientOrganization.findUnique({ where: { id: clientOrganizationId }, select: { id: true, name: true } }),
    db.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, active: true } }),
  ]);
  if (!org) throw new Error("Unknown client");
  if (!u || !u.active) throw new Error("Unknown or inactive user");

  await db.clientAssignment.upsert({
    where: { clientOrganizationId_userId: { clientOrganizationId, userId } },
    update: { role },
    create: { clientOrganizationId, userId, role },
  });
  await logActivity({
    source: "hr_action",
    eventType: "client_assignment",
    severity: "success",
    summary: `${u.name ?? u.email} assigned to ${org.name} as ${role === "LEAD" ? "Lead" : "VA"}.`,
  });
  return { ok: true };
}

export async function unassignFromClient(actor: Actor, clientOrganizationId: string, userId: string) {
  assertCanManageTeam(actor);
  if (!clientOrganizationId || !userId) throw new Error("Missing client or user");
  const [org, u] = await Promise.all([
    db.clientOrganization.findUnique({ where: { id: clientOrganizationId }, select: { name: true } }),
    db.user.findUnique({ where: { id: userId }, select: { name: true, email: true } }),
  ]);
  await db.clientAssignment.deleteMany({ where: { clientOrganizationId, userId } });
  await logActivity({
    source: "hr_action",
    eventType: "client_unassignment",
    severity: "info",
    summary: `${u?.name ?? u?.email ?? "Someone"} removed from ${org?.name ?? "a client"}.`,
  });
  return { ok: true };
}
