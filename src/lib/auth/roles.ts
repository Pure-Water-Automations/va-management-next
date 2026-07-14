import type { Role } from "@prisma/client";

/** Top-level console a role lands in (mirrors the va-console view routing). */
export type ConsoleView = "ADMIN" | "HR" | "PAYROLL" | "VA" | "RECRUITMENT" | "SALES" | "CLIENT";

export function viewForRole(role: Role): ConsoleView {
  switch (role) {
    case "HR_MANAGER":
    case "PEOPLE_OPS":
      return "HR";
    case "TESTER": // all-access; lands in the Admin console (all-access default view)
      return "ADMIN";
    case "BOOKKEEPER":
      return "PAYROLL";
    case "RECRUITER":
      return "RECRUITMENT";
    case "SALES":
      return "SALES";
    case "CLIENT_ADMIN":
    case "CLIENT_MEMBER":
      return "CLIENT";
    // SENIOR_VA / TEAM_LEAD are retired (deprecated enum values); they fall through
    // to the VA console. Seniority is tier-driven, not role-driven.
    case "VA":
    default:
      return "VA";
  }
}

/** Roles allowed to work the sales pipeline (deals, discovery calls, agreements). */
export function isSalesRep(role: Role): boolean {
  return role === "SALES" || role === "HR_MANAGER" || role === "PEOPLE_OPS";
}

/** Roles allowed into the payroll console. Bookkeeper is the home role; HR
 *  Manager / People-Ops also edit profiles and exclude rows there. */
export function isPayrollUser(role: Role): boolean {
  return role === "BOOKKEEPER" || role === "HR_MANAGER" || role === "PEOPLE_OPS";
}

/**
 * Roles allowed to review the 10-hr gate, contracts, and onboarding. Recruitment is
 * consolidated under the Recruiter role; HR Manager / People-Ops keep access for the
 * final hire decision.
 */
export function isGateReviewer(role: Role): boolean {
  return (
    role === "HR_MANAGER" ||
    role === "PEOPLE_OPS" ||
    role === "RECRUITER"
  );
}

/** Roles allowed to read/score/recommend in the recruitment pipeline. */
export function isRecruiter(role: Role): boolean {
  return role === "RECRUITER" || role === "HR_MANAGER" || role === "PEOPLE_OPS";
}

/** Only HR Manager / People-Ops make the final hire/reject decision. */
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
