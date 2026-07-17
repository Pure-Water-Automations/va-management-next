// Boundary between the trial engine and the AI layer. The engine calls these
// two hooks only; implementations live in src/lib/trial/ai/. Both fail SOFT:
// any AI error returns a null-ish result so a step stays SUBMITTED for human
// review and chat simply gets no auto-reply.
import type { CandidateMission, CandidateTrial, MissionTemplate } from "@prisma/client";
import type {
  AiEvaluationProposal,
  StepSubmitRequest,
  TrialActorType,
  TrialMessageView,
} from "@/lib/trial/types";
import {
  evaluateSimSubmission as aiEvaluateSimSubmission,
  generateActorReply as aiGenerateActorReply,
} from "@/lib/trial/ai";
import type { ActorReplyResult } from "@/lib/trial/ai/reply";

export type { ActorReplyResult };

export async function evaluateSimSubmission(input: {
  trial: CandidateTrial;
  mission: CandidateMission;
  template: MissionTemplate;
  submission: StepSubmitRequest;
}): Promise<AiEvaluationProposal | null> {
  try {
    return await aiEvaluateSimSubmission(input);
  } catch {
    return null; // AI unavailable -> step stays SUBMITTED for human review
  }
}

export async function generateActorReply(input: {
  trial: CandidateTrial;
  actorType: TrialActorType;
  candidateText: string;
  history: TrialMessageView[];
}): Promise<ActorReplyResult> {
  try {
    return await aiGenerateActorReply({
      trial: {
        id: input.trial.id,
        timezone: input.trial.timezone,
        declaredDays: input.trial.declaredDays,
        declaredBlock: input.trial.declaredBlock,
      },
      actorType: input.actorType,
      candidateText: input.candidateText,
      history: input.history,
    });
  } catch {
    return { reply: null, escalated: false, escalationReason: null };
  }
}
