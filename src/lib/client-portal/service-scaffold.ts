import type { CreateTaskInput } from "@/lib/actions/tasks";
import type { ClientTaskIntakeInput, ClientPortalTaskSummary } from "./types";
import { buildInternalInstructionsFromClientRequest } from "./task-intake";

export type ClientTaskTriageState =
  | "received"
  | "needs_team_review"
  | "ready_to_assign"
  | "assigned"
  | "blocked"
  | "completed";

export function buildCreateTaskInputFromClientIntake(
  input: ClientTaskIntakeInput,
  opts: {
    clientDisplayName?: string;
    defaultAssigneeId?: string;
    allowSuggestedAssignee?: boolean;
  } = {},
): CreateTaskInput {
  const assignedToId =
    opts.allowSuggestedAssignee && input.suggestedAssigneeId
      ? input.suggestedAssigneeId
      : opts.defaultAssigneeId;

  if (!assignedToId) {
    throw new Error("Client task intake needs a triage assignee or explicit VA assignee");
  }

  return {
    title: input.title,
    instructions: buildInternalInstructionsFromClientRequest(input),
    strategy: "Delegate",
    priority: input.priority ?? "Medium",
    client: opts.clientDisplayName,
    projectId: input.projectId,
    assignedToId,
    dueDate: input.dueDate,
    links: input.links,
  };
}

export function getClientTaskTriageState(task: Pick<ClientPortalTaskSummary, "status" | "waitingOn">): ClientTaskTriageState {
  if (task.status === "Done") return "completed";
  if (task.status === "Blocked") return "blocked";
  if (task.waitingOn === "client") return "needs_team_review";
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
