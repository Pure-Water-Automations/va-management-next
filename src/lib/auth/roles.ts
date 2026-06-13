import type { Role } from "@prisma/client";

/** Top-level console a role lands in (mirrors the va-console view routing). */
export type ConsoleView = "HR" | "PAYROLL" | "VA" | "RECRUITMENT";

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

export class AuthorizationError extends Error {
  constructor(message = "Not authorized") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export function assert(condition: boolean, message?: string): void {
  if (!condition) throw new AuthorizationError(message);
}
