import type { Role } from "@prisma/client";

const PRIVILEGED_APPROVERS = new Set<string>(["HR_MANAGER", "PEOPLE_OPS", "BOOKKEEPER"]);

// Who may approve a payroll row: payroll/HR staff and admins approve any row;
// otherwise the actor must be the row VA's supervisor via Va.supervisorVaId.
export function canApproveRow(
  actor: { isAdmin: boolean; role: Role | string; vaId: string | null },
  rowSupervisorVaId: string | null,
): boolean {
  if (actor.isAdmin || PRIVILEGED_APPROVERS.has(actor.role)) return true;
  return !!actor.vaId && !!rowSupervisorVaId && actor.vaId === rowSupervisorVaId;
}
