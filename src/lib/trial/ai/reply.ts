import type { TrialActorType } from "@/lib/trial/types";
import { chatJson, type TrialAiTransport } from "./client";
import { escalationCheck, outputFilter } from "./guardrails";
import { emilyPrompt, michaelPrompt, puriiPrompt, sarahPrompt, type PersonaContext } from "./personas";
import { sanitizeForModel } from "./sanitize";

interface HistoryMessage {
  from?: string;
  text: string;
  day?: number;
  timestamp?: string | Date;
}

export interface ActorReplyResult {
  reply: string | null;
  escalated: boolean;
  escalationReason: string | null;
}

export interface GenerateActorReplyInput {
  trial: PersonaContext & { id: string };
  actorType: TrialActorType;
  candidateText: string;
  history: HistoryMessage[];
  transport?: TrialAiTransport;
}

function isReply(value: unknown): value is { reply: string } {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof (value as { reply?: unknown }).reply === "string" &&
    (value as { reply: string }).reply.trim().length > 0
  );
}

export async function generateActorReply({
  trial,
  actorType,
  candidateText,
  history,
  transport,
}: GenerateActorReplyInput): Promise<ActorReplyResult> {
  const escalation = escalationCheck(candidateText);
  if (escalation.escalate || actorType === "Human") {
    return {
      reply: null,
      escalated: true,
      escalationReason: escalation.reason || "human_conversation",
    };
  }

  const prompts = {
    Purii: puriiPrompt,
    Sarah: sarahPrompt,
    Emily: emilyPrompt,
    Michael: michaelPrompt,
  } as const;
  const transcript = history
    .slice(-10)
    .map((message) => `${message.from || "unknown"}: ${sanitizeForModel(message.text).clean}`)
    .join("\n");
  const cleanCandidateText = sanitizeForModel(candidateText).clean;
  const response = await chatJson<{ reply: string }>(
    prompts[actorType](trial),
    `RECENT CONVERSATION (up to 10 messages):\n${transcript || "(none)"}\n\nCANDIDATE MESSAGE:\n${cleanCandidateText}\n\nRespond to the candidate now.`,
    '{ "reply": "string" }',
    { trialId: trial.id, transport, validate: isReply },
  );
  if (!response) return { reply: null, escalated: false, escalationReason: null };

  // No disclosure prefix here — the stored message already carries structured
  // attribution (from + "AI reply" tag); a text prefix would double-badge the UI.
  const filtered = outputFilter(response.reply);
  return {
    reply: filtered.trim(),
    escalated: false,
    escalationReason: null,
  };
}
