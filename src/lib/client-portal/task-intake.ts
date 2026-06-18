import { z } from "zod";
import type { ClientTaskIntakeInput } from "./types";

function isValidDueDate(value: string): boolean {
  if (!value) return true;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

export const clientTaskIntakeSchema = z.object({
  clientOrganizationId: z.string().min(1, "Client organization is required"),
  requestedByUserId: z.string().min(1, "Requester is required"),
  title: z.string().trim().min(3, "Use a clear task title"),
  desiredOutcome: z
    .string()
    .trim()
    .min(10, "Describe the outcome you want")
    .max(8000, "Keep the request under 8,000 characters"),
  projectId: z.string().trim().optional().or(z.literal("")),
  priority: z.enum(["Low", "Medium", "High"]).default("Medium"),
  dueDate: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((value) => isValidDueDate(value ?? ""), "Use a valid due date"),
  links: z.string().trim().max(4000).optional().or(z.literal("")),
  suggestedAssigneeId: z.string().trim().optional().or(z.literal("")),
  approvalRequired: z.coerce.boolean().default(false),
  clientNotes: z.string().trim().max(4000).optional().or(z.literal("")),
});

export type ClientTaskIntakeFormData = z.infer<typeof clientTaskIntakeSchema>;

export function parseClientTaskIntake(input: unknown): ClientTaskIntakeInput {
  const parsed = clientTaskIntakeSchema.parse(input);

  return {
    clientOrganizationId: parsed.clientOrganizationId,
    requestedByUserId: parsed.requestedByUserId,
    title: parsed.title,
    desiredOutcome: parsed.desiredOutcome,
    priority: parsed.priority,
    approvalRequired: parsed.approvalRequired,
    ...(parsed.projectId ? { projectId: parsed.projectId } : {}),
    ...(parsed.dueDate ? { dueDate: parsed.dueDate } : {}),
    ...(parsed.links ? { links: parsed.links } : {}),
    ...(parsed.suggestedAssigneeId ? { suggestedAssigneeId: parsed.suggestedAssigneeId } : {}),
    ...(parsed.clientNotes ? { clientNotes: parsed.clientNotes } : {}),
  };
}

export function buildInternalInstructionsFromClientRequest(input: ClientTaskIntakeInput): string {
  const lines = [
    "Client request",
    "",
    `Desired outcome:\n${input.desiredOutcome}`,
    input.clientNotes ? `\nClient notes:\n${input.clientNotes}` : null,
    input.links ? `\nLinks:\n${input.links}` : null,
    input.approvalRequired ? "\nApproval required before final delivery." : null,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

export function normalizeClientIntakeDueDate(dueDate?: string): Date | undefined {
  if (!dueDate) return undefined;
  const parsed = new Date(dueDate);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
