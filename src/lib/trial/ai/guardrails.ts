import type { TrialActorType } from "@/lib/trial/types";

export interface EscalationResult {
  escalate: boolean;
  reason: string | null;
}

const ESCALATION_PATTERNS: Array<{ reason: string; pattern: RegExp }> = [
  {
    reason: "health_or_emergency",
    pattern: /\b(sick|sickness|ill|illness|hospital|medical|doctor|health|emergency|family (?:crisis|emergency)|bereavement|death in (?:my|the) family)\b/i,
  },
  {
    reason: "timezone_conflict_or_accommodation",
    pattern: /\b(accommodat(?:e|ion|ions)|disab(?:ility|led)|accessibility|timezone conflict|time zone conflict|cannot work (?:in|during) (?:my|the) time|schedule restriction)\b/i,
  },
  {
    reason: "technical_platform_problem",
    pattern: /\b(platform|website|console|login|upload|timer)\b.{0,30}\b(broken|error|failed|not working|won't work|cannot|can't)\b|\b(broken|error|not working)\b.{0,30}\b(platform|website|console|login|upload|timer)\b/i,
  },
  {
    reason: "hostile_or_defensive_sentiment",
    pattern: /\b(this is (?:stupid|ridiculous|unfair)|you(?:'re| are) wrong|not my fault|your fault|stop bothering me|leave me alone|angry|furious|hostile|idiot|damn you|i refuse)\b|(?:!\s*){3,}/i,
  },
  {
    reason: "human_requested",
    pattern: /\b(?:speak|talk|chat) (?:to|with) (?:a )?(?:human|person)|\bhuman help\b|\breal person\b/i,
  },
];

export function escalationCheck(text: string): EscalationResult {
  for (const rule of ESCALATION_PATTERNS) {
    if (rule.pattern.test(text)) return { escalate: true, reason: rule.reason };
  }
  return { escalate: false, reason: null };
}

const PROHIBITED_OUTPUT = [
  /\bpassed\b/i,
  /\bfailed\b/i,
  /\bhired\b/i,
  /\byou got the job\b/i,
  /\bwe(?:'d| would| will) (?:like to )?(?:hire|employ|offer you)\b/i,
  /\bjob offer\b/i,
  /\b(?:hourly )?rate\s*(?:is|will be|of|:)?\s*\$?\d+/i,
  /\$?\d+(?:\.\d{1,2})?\s*(?:\/|per)\s*hour\b/i,
  /\b(?:negotiate|increase|lower|agree (?:to|on))\b.{0,30}\b(?:rate|pay|salary|compensation)\b/i,
];

const NEUTRAL_REDIRECT =
  "Trial outcomes, employment decisions, and compensation are handled by a human reviewer.";

/** Remove prohibited promises sentence-by-sentence while preserving useful content. */
export function outputFilter(text: string): string {
  const sentences = text.match(/[^.!?\n]+[.!?]?|\n+/g) || [text];
  let redirected = false;
  const filtered = sentences.map((sentence) => {
    if (!PROHIBITED_OUTPUT.some((pattern) => pattern.test(sentence))) return sentence;
    if (redirected) return "";
    redirected = true;
    return ` ${NEUTRAL_REDIRECT}`;
  });
  return filtered.join("").replace(/[ \t]{2,}/g, " ").trim();
}

export function disclosureTag(actorType: TrialActorType | "ReviewerAssistant"): string {
  const tags: Record<TrialActorType | "ReviewerAssistant", string> = {
    Purii: "[Purii · AI coordinator]",
    Sarah: "[Sarah · AI Project Manager]",
    Emily: "[Emily · AI Senior VA]",
    Michael: "[Michael · AI simulated client]",
    Human: "[PWA · Human team]",
    ReviewerAssistant: "[Reviewer Assistant · AI draft]",
  };
  return tags[actorType];
}
