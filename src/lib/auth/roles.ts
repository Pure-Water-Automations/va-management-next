import type { Role } from "@prisma/client";

/** Top-level console a role lands in (mirrors the va-console view routing). */
export type ConsoleView = "HR" | "PAYROLL" | "VA" | "RECRUITMENT" | "CLIENT";

export function viewForRole(role: Role): ConsoleView {
  switch (role) {
    case "HR_MANAGER":
    case "PEOPLE_OPS":
    case "TEAM_LEAD":
      return "HR";
    case "BOOKKEEPER":
      return "PAYROLL";
    case "RECRUITER":
      return "RECRUITMENT";
    case "CLIENT_ADMIN":
    case "CLIENT_MEMBER":
      return "CLIENT";
    case "SENIOR_VA":
    case "VA":
    default:
      return "VA";
  }
}

/** Team Lead sees the HR console read-only; HR mutations are server-blocked. */
export function isReadOnly(role: Role): boolean {
  return role === "TEAM_LEAD";
}

/** Roles allowed to review the 10-hr gate, contracts, and onboarding. */
export function isGateReviewer(role: Role): boolean {
  return role === "HR_MANAGER" || role === "PEOPLE_OPS" || role === "TEAM_LEAD";
}

/** Roles allowed to read/score/recommend in the recruitment pipeline. */
export function isRecruiter(role: Role): boolean {
  return (
    role === "RECRUITER" ||
    role === "HR_MANAGER" ||
    role === "PEOPLE_OPS" ||
    role === "TEAM_LEAD"
  );
}

/** Only HR Manager makes the final hire/reject decision. */
export function canDecideHire(role: Role): boolean {
  return role === "HR_MANAGER" || role === "PEOPLE_OPS";
}

/** Roles that can create tasks and assign them to VAs. */
export function canManageTasks(role: Role): boolean {
  return (
    role === "HR_MANAGER" ||
    role === "PEOPLE_OPS" ||
    role === "TEAM_LEAD" ||
    role === "SENIOR_VA"
  );
}

/** Alias for canManageTasks — used in delegation-specific contexts. */
export function isTaskDelegator(role: Role): boolean {
  return canManageTasks(role);
}

/** Roles that can create, edit, and delete projects. SENIOR_VA is excluded. */
export function canManageProjects(role: Role): boolean {
  return role === "HR_MANAGER" || role === "PEOPLE_OPS" || role === "TEAM_LEAD";
}

export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assert(condition: boolean, message?: string): void {
  if (!condition) throw new AuthorizationError(message);
}
