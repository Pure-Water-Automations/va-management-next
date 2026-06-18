import type {
  ClientPortalAccessContext,
  ClientPortalProjectSummary,
  ClientPortalTaskSummary,
  ClientVisibility,
} from "./types";

export class ClientPortalAuthorizationError extends Error {
  constructor(message = "Not authorized for client portal access") {
    super(message);
    this.name = "ClientPortalAuthorizationError";
  }
}

const INTERNAL_MANAGER_ROLES = new Set(["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD"]);
const INTERNAL_WORK_ROLES = new Set(["SENIOR_VA", "VA"]);

export function isPwaAdmin(ctx: ClientPortalAccessContext): boolean {
  return ctx.isAdmin === true || ctx.role === "HR_MANAGER" || ctx.role === "PEOPLE_OPS";
}

export function isTeamLeader(ctx: ClientPortalAccessContext): boolean {
  return ctx.role === "TEAM_LEAD";
}

export function isInternalActor(ctx: ClientPortalAccessContext): boolean {
  return ctx.actorKind === "internal";
}

export function isClientActor(ctx: ClientPortalAccessContext): boolean {
  return ctx.actorKind === "client";
}

export function isClientAdmin(ctx: ClientPortalAccessContext): boolean {
  return ctx.role === "CLIENT_ADMIN";
}

export function isClientMember(ctx: ClientPortalAccessContext): boolean {
  return ctx.role === "CLIENT_ADMIN" || ctx.role === "CLIENT_MEMBER";
}

export function canUseClientPortal(ctx: ClientPortalAccessContext): boolean {
  if (isPwaAdmin(ctx)) return true;
  if (isTeamLeader(ctx)) return true;
  if (isClientMember(ctx)) return true;
  if (INTERNAL_WORK_ROLES.has(ctx.role)) return true;
  return false;
}

export function assertCanUseClientPortal(ctx: ClientPortalAccessContext): void {
  if (!canUseClientPortal(ctx)) throw new ClientPortalAuthorizationError();
}

export function canAccessClientOrganization(
  ctx: ClientPortalAccessContext,
  clientOrganizationId: string,
): boolean {
  if (isPwaAdmin(ctx)) return true;
  return ctx.clientOrganizationIds?.includes(clientOrganizationId) === true;
}

export function assertCanAccessClientOrganization(
  ctx: ClientPortalAccessContext,
  clientOrganizationId: string,
): void {
  assertCanUseClientPortal(ctx);
  if (!canAccessClientOrganization(ctx, clientOrganizationId)) {
    throw new ClientPortalAuthorizationError("You do not have access to this client organization");
  }
}

export function canViewClientProject(
  ctx: ClientPortalAccessContext,
  project: Pick<ClientPortalProjectSummary, "clientOrganizationId">,
): boolean {
  return canAccessClientOrganization(ctx, project.clientOrganizationId);
}

export function canViewClientTask(
  ctx: ClientPortalAccessContext,
  task: Pick<ClientPortalTaskSummary, "id" | "clientOrganizationId">,
): boolean {
  if (canAccessClientOrganization(ctx, task.clientOrganizationId)) return true;

  // VA-limited view: a VA may see only tasks explicitly assigned/shared to them.
  if (INTERNAL_WORK_ROLES.has(ctx.role)) {
    return ctx.assignedTaskIds?.includes(task.id) === true;
  }

  return false;
}

export function canCreateClientTaskRequest(
  ctx: ClientPortalAccessContext,
  clientOrganizationId: string,
): boolean {
  if (!canAccessClientOrganization(ctx, clientOrganizationId)) return false;
  if (isClientMember(ctx)) return true;
  if (INTERNAL_MANAGER_ROLES.has(ctx.role) || isPwaAdmin(ctx)) return true;
  return false;
}

export function canAssignVaForClientTask(ctx: ClientPortalAccessContext): boolean {
  return isPwaAdmin(ctx) || isTeamLeader(ctx);
}

export function canEditClientProject(ctx: ClientPortalAccessContext, clientOrganizationId: string): boolean {
  if (!canAccessClientOrganization(ctx, clientOrganizationId)) return false;
  return isPwaAdmin(ctx) || isTeamLeader(ctx);
}

export function canAddClientVisibleComment(
  ctx: ClientPortalAccessContext,
  clientOrganizationId: string,
): boolean {
  if (!canAccessClientOrganization(ctx, clientOrganizationId)) return false;
  return isClientMember(ctx) || isPwaAdmin(ctx) || isTeamLeader(ctx);
}

export function canAddInternalOnlyComment(ctx: ClientPortalAccessContext): boolean {
  return isInternalActor(ctx);
}

export function defaultCommentVisibility(ctx: ClientPortalAccessContext): ClientVisibility {
  // Safety-first: internal users create internal-only notes unless they explicitly publish.
  return isClientActor(ctx) ? "client_visible" : "internal_only";
}

export function canSeeVisibility(ctx: ClientPortalAccessContext, visibility: ClientVisibility): boolean {
  if (visibility === "client_visible") return true;
  return isInternalActor(ctx) || isPwaAdmin(ctx);
}

export function canApproveDeliverable(
  ctx: ClientPortalAccessContext,
  clientOrganizationId: string,
): boolean {
  if (!canAccessClientOrganization(ctx, clientOrganizationId)) return false;
  return isClientAdmin(ctx) || isPwaAdmin(ctx);
}

export function canRequestRevision(
  ctx: ClientPortalAccessContext,
  clientOrganizationId: string,
): boolean {
  if (!canAccessClientOrganization(ctx, clientOrganizationId)) return false;
  return isClientMember(ctx) || isPwaAdmin(ctx) || isTeamLeader(ctx);
}

export function canInviteClientUsers(
  ctx: ClientPortalAccessContext,
  clientOrganizationId: string,
): boolean {
  if (!canAccessClientOrganization(ctx, clientOrganizationId)) return false;
  return isClientAdmin(ctx) || isPwaAdmin(ctx);
}
