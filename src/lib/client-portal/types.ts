export type ClientPortalActorKind = "internal" | "client";

export type ClientPortalInternalRole =
  | "HR_MANAGER"
  | "PEOPLE_OPS"
  | "TEAM_LEAD"
  | "SENIOR_VA"
  | "VA";

export type ClientPortalExternalRole = "CLIENT_ADMIN" | "CLIENT_MEMBER";

export type ClientPortalRole = ClientPortalInternalRole | ClientPortalExternalRole;

export type ClientVisibility = "internal_only" | "client_visible";

export type ClientCommentIntent =
  | "update"
  | "question"
  | "approval_request"
  | "revision_request"
  | "note";

export type ClientTaskSource = "internal" | "client_portal" | "import";

export type ClientDeliverableStatus =
  | "draft"
  | "ready_for_review"
  | "approved"
  | "revision_requested"
  | "final";

export type ClientTaskRequestStatus =
  | "received"
  | "triage_needed"
  | "ready_to_assign"
  | "assigned"
  | "declined"
  | "completed";

export type ClientPortalAccessContext = {
  userId: string;
  email?: string | null;
  isAdmin?: boolean;
  actorKind: ClientPortalActorKind;
  role: ClientPortalRole;
  /** Client orgs this actor is allowed to see. Admins may omit and rely on isAdmin. */
  clientOrganizationIds?: string[];
  /** VA task ids assigned/shared to this actor. Used for VA-limited client work views. */
  assignedTaskIds?: string[];
  /** Project ids this internal actor is explicitly participating in or managing. */
  assignedProjectIds?: string[];
};

export type ClientScopedResource = {
  clientOrganizationId: string;
};

export type ClientScopedTaskResource = ClientScopedResource & {
  id: string;
  assignedToUserId?: string | null;
  assignedByUserId?: string | null;
  projectOwnerUserId?: string | null;
};

export type ClientScopedProjectResource = ClientScopedResource & {
  id: string;
  ownerUserId?: string | null;
};

export type ClientVisibleResource = ClientScopedResource & {
  visibility: ClientVisibility;
};

export type ClientPortalProjectSummary = {
  id: string;
  clientOrganizationId: string;
  name: string;
  description?: string | null;
  status: string;
  priority: string;
  dueDate?: Date | string | null;
  progress: number;
  openTaskCount: number;
  waitingOnClientCount: number;
  latestUpdate?: string | null;
};

export type ClientPortalTaskSummary = {
  id: string;
  clientOrganizationId: string;
  projectId?: string | null;
  title: string;
  clientSummary?: string | null;
  status: string;
  priority: string;
  dueDate?: Date | string | null;
  assignedToName?: string | null;
  waitingOn: "client" | "team" | "va" | "none";
  source: ClientTaskSource;
};

export type ClientTaskIntakeInput = {
  clientOrganizationId: string;
  requestedByUserId: string;
  title: string;
  desiredOutcome: string;
  projectId?: string;
  priority?: "Low" | "Medium" | "High";
  dueDate?: string;
  links?: string;
  suggestedAssigneeId?: string;
  approvalRequired?: boolean;
  clientNotes?: string;
};

export type ClientTaskRequestDraft = ClientTaskIntakeInput & {
  status: ClientTaskRequestStatus;
  source: "client_portal";
  visibility: "client_visible";
};

export type ClientPortalNavItem = {
  label: string;
  href: string;
  badge?: number;
};

export type ClientPortalDashboard = {
  clientOrganizationId: string;
  clientName: string;
  stats: {
    activeProjects: number;
    openTasks: number;
    waitingOnClient: number;
    completedThisWeek: number;
  };
  projects: ClientPortalProjectSummary[];
  waitingOnClient: ClientPortalTaskSummary[];
  inProgress: ClientPortalTaskSummary[];
  recentDeliverables: Array<{
    id: string;
    title: string;
    projectName?: string | null;
    url?: string | null;
    createdAt: Date | string;
  }>;
};

export function isClientPortalExternalRole(role: string): role is ClientPortalExternalRole {
  return role === "CLIENT_ADMIN" || role === "CLIENT_MEMBER";
}

export function isClientPortalInternalRole(role: string): role is ClientPortalInternalRole {
  return ["HR_MANAGER", "PEOPLE_OPS", "TEAM_LEAD", "SENIOR_VA", "VA"].includes(role);
}
