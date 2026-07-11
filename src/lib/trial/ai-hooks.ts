import type { CandidateMission, CandidateTrial, MissionTemplate } from "@prisma/client";
import type {
  AiEvaluationProposal,
  StepSubmitRequest,
  TrialActorType,
  TrialMessageView,
} from "@/lib/trial/types";

export async function evaluateSimSubmission(_input: {
  trial: CandidateTrial;
  mission: CandidateMission;
  template: MissionTemplate;
  submission: StepSubmitRequest;
}): Promise<AiEvaluationProposal | null> {
  return null;
}

export async function generateActorReply(_input: {
  trial: CandidateTrial;
  actorType: TrialActorType;
  candidateText: string;
  history: TrialMessageView[];
}): Promise<string | null> {
  return null;
}
