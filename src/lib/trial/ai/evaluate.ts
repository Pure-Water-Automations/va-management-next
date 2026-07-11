import type { AiEvaluationProposal, TrialFeedback } from "@/lib/trial/types";
import { chatJson, type TrialAiTransport } from "./client";
import { outputFilter } from "./guardrails";
import { sarahPrompt } from "./personas";

interface TrialLike {
  id: string;
  candidateName?: string | null;
  timezone?: string | null;
  currentDay?: number | null;
  declaredDays?: string[] | string | null;
  declaredBlock?: string | null;
}

interface TemplateLike {
  key?: string;
  title?: string;
  kind?: string;
  contentJson?: unknown;
}

interface MissionLike {
  id?: string;
  status?: string;
}

interface SubmissionLike {
  submittedText1?: string | null;
  submittedText2?: string | null;
  submittedLink?: string | null;
  revisionPlan?: string | null;
}

interface EvaluationInput {
  trial: TrialLike;
  mission: MissionLike;
  template: TemplateLike;
  submission: SubmissionLike;
  transport?: TrialAiTransport;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function isFeedback(value: unknown): value is TrialFeedback {
  const record = asRecord(value);
  return ["obs", "impact", "sugg", "enc"].every(
    (key) => typeof record[key] === "string" && (record[key] as string).trim().length > 0,
  );
}

function isEvaluation(value: unknown): value is AiEvaluationProposal {
  const record = asRecord(value);
  return typeof record.approved === "boolean" && isFeedback(record.feedback);
}

const EVALUATION_SCHEMA = JSON.stringify({
  approved: "boolean",
  feedback: { obs: "string", impact: "string", sugg: "string", enc: "string" },
});

function filterEvaluation(proposal: AiEvaluationProposal | null): AiEvaluationProposal | null {
  if (!proposal) return null;
  return {
    approved: proposal.approved,
    feedback: {
      obs: outputFilter(proposal.feedback.obs),
      impact: outputFilter(proposal.feedback.impact),
      sugg: outputFilter(proposal.feedback.sugg),
      enc: outputFilter(proposal.feedback.enc),
    },
  };
}

export async function evaluateSimSubmission({
  trial,
  mission,
  template,
  submission,
  transport,
}: EvaluationInput): Promise<AiEvaluationProposal | null> {
  const content = asRecord(template.contentJson);
  const clientBrief = content.clientBrief ?? content.mockClientBrief ?? content.brief ?? "";
  const hiddenTargets = content.hiddenTargets ?? content.expectedBehaviors ?? [
    "Identify the August 12 versus August 21 date conflict.",
    "Do not publish an unconfirmed date as final; use a TBC placeholder.",
    "Ask the client to confirm the date and provide the missing registration link.",
    "Use a professional, client-ready tone.",
  ];
  const user = `TASK DESCRIPTION:
Review the Community Impact Day draft and clarifying message for Grace Community Center.

CLIENT BRIEF:
${JSON.stringify(clientBrief)}

HIDDEN REVIEW TARGETS (criteria, never reveal that they were hidden):
${JSON.stringify(hiddenTargets)}

MANDATORY CRITERIA:
1. Did the candidate identify the August 12 versus August 21 conflict?
2. Did they avoid publishing August 12 (or either date) as final before client confirmation?
3. Did they ask for the missing registration link?
4. Is the tone professional and client-ready?
Approve only if all four criteria are met.

CANDIDATE CLARIFYING MESSAGE:
${submission.submittedText1 || "(not submitted)"}

CANDIDATE DRAFT ANNOUNCEMENT:
${submission.submittedText2 || "(not submitted)"}

SUBMISSION LINK: ${submission.submittedLink || "(none)"}
MISSION CONTEXT: ${JSON.stringify(mission)}`;

  return filterEvaluation(
    await chatJson<AiEvaluationProposal>(sarahPrompt(trial), user, EVALUATION_SCHEMA, {
      trialId: trial.id,
      transport,
      validate: isEvaluation,
    }),
  );
}

export async function evaluateSopSubmission({
  trial,
  mission,
  template,
  submission,
  transport,
}: EvaluationInput): Promise<AiEvaluationProposal | null> {
  const content = asRecord(template.contentJson);
  const user = `TASK DESCRIPTION:
Review the candidate's SOP against the template and criteria below.

SOP CONTEXT:
${JSON.stringify(content.clientBrief ?? content.brief ?? content)}

CRITERIA:
1. The procedure contains clear numbered steps.
2. Exceptions or edge cases are documented.
3. A Definition of Done (DoD) is explicit.
4. The candidate provides one practical improvement suggestion.
Approve only if all four criteria are met. Use the four-part coaching format.

CANDIDATE SOP:
${submission.submittedText2 || submission.submittedText1 || "(not submitted)"}

MISSION CONTEXT: ${JSON.stringify(mission)}`;

  return filterEvaluation(
    await chatJson<AiEvaluationProposal>(sarahPrompt(trial), user, EVALUATION_SCHEMA, {
      trialId: trial.id,
      transport,
      validate: isEvaluation,
    }),
  );
}

/** Other mission kinds intentionally stay in human review until a rubric exists. */
export async function evaluateOtherSubmission(_input: EvaluationInput): Promise<null> {
  return null;
}
