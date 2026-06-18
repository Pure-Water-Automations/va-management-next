import type { CreateTaskInput } from "@/lib/actions/tasks";
import type {
  ClientTaskIntakeInput,
  ClientTaskRequestDraft,
  ClientTaskRequestStatus,
  ClientPortalTaskSummary,
} from "./types";
import { buildInternalInstructionsFromClientRequest } from "./task-intake";

export type ClientTaskTriageState = ClientTaskRequestStatus;

export type ApprovedClientTaskRequest = ClientTaskRequestDraft & {
  id: string;
  triagedByUserId: string;
  assignedToId: string;
  clientDisplayName?: string;
};

/**
 * Client intake should create a request first, not a live assigned VA task.
 * The real implementation should persist this shape to ClientTaskRequest, then let
 * a Team Leader triage/assign it into the existing Task system.
 */
export function buildClientTaskRequestDraft(input: ClientTaskIntakeInput): ClientTaskRequestDraft {
  return {
    ...input,
    status: "received",
    source: "client_portal",
    visibility: "client_visible",
  };
}

/**
 * Only call this after a Team Leader/Admin has approved and assigned the request.
 * This is deliberately separate from client intake so a client submission cannot
 * accidentally trigger immediate assignment emails or bypass triage.
 */
export function buildCreateTaskInputFromApprovedClientRequest(
  request: ApprovedClientTaskRequest,
): CreateTaskInput {
  return {
    title: request.title,
    instructions: buildInternalInstructionsFromClientRequest(request),
    strategy: "Delegate",
    priority: request.priority ?? "Medium",
    client: request.clientDisplayName,
    projectId: request.projectId,
    assignedToId: request.assignedToId,
    dueDate: request.dueDate,
    links: request.links,
  };
}

export function getClientTaskTriageState(task: Pick<ClientPortalTaskSummary, "status" | "waitingOn">): ClientTaskTriageState {
  if (task.status === "Done") return "completed";
  if (task.status === "Blocked") return "triage_needed";
  if (task.waitingOn === "client") return "triage_needed";
  if (task.status === "NotStarted") return "received";
  if (task.status === "InProgress") return "assigned";
  return "ready_to_assign";
}

export function getClientSafeTaskLabel(status: string): string {
  switch (status) {
    case "NotStarted":
      return "Received";
    case "InProgress":
      return "In progress";
    case "Blocked":
      return "Waiting / blocked";
    case "Done":
      return "Completed";
    default:
      return status;
  }
}

export function getWaitingOnLabel(waitingOn: ClientPortalTaskSummary["waitingOn"]): string {
  switch (waitingOn) {
    case "client":
      return "Waiting on you";
    case "team":
      return "Waiting on team";
    case "va":
      return "With VA";
    case "none":
    default:
      return "On track";
  }
}
