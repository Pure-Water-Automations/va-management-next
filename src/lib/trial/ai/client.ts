const MAX_PROMPT_CHARS = 24_000;
const CALLS_PER_MINUTE = 10;
const REFILL_WINDOW_MS = 60_000;

export interface TrialAiTransportResponse {
  choices?: Array<{ message?: { content?: string } }>;
}

export type TrialAiTransport = (body: {
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
  model?: string;
}) => Promise<TrialAiTransportResponse>;

export interface ChatJsonOptions<T> {
  trialId?: string;
  transport?: TrialAiTransport;
  validate?: (value: unknown) => value is T;
}

interface Bucket {
  tokens: number;
  updatedAt: number;
}

const buckets = new Map<string, Bucket>();

function takeToken(trialId: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(trialId) ?? { tokens: CALLS_PER_MINUTE, updatedAt: now };
  const elapsed = now - bucket.updatedAt;
  bucket.tokens = Math.min(
    CALLS_PER_MINUTE,
    bucket.tokens + (elapsed / REFILL_WINDOW_MS) * CALLS_PER_MINUTE,
  );
  bucket.updatedAt = now;
  if (bucket.tokens < 1) {
    buckets.set(trialId, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(trialId, bucket);
  return true;
}

async function defaultTransport(
  body: Parameters<TrialAiTransport>[0],
): Promise<TrialAiTransportResponse> {
  const [{ openrouterChat }, { env }] = await Promise.all([
    import("@/lib/matrix/openrouter"),
    import("@/lib/env"),
  ]);
  return openrouterChat({ ...body, model: env.TRIAL_AI_MODEL });
}

function isJsonContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === "object";
}

function parseJsonContent(content: string): unknown {
  const trimmed = content.trim();
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    // Models occasionally wrap otherwise-valid JSON in a single markdown fence.
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (!fenced) return null;
    try {
      return JSON.parse(fenced[1]) as unknown;
    } catch {
      return null;
    }
  }
}

/**
 * Request and validate strict JSON. AI/network failures are deliberately
 * converted to null so simulation workflows can fall back to human review.
 */
export async function chatJson<T>(
  system: string,
  user: string,
  schemaHint: string,
  options: ChatJsonOptions<T> = {},
): Promise<T | null> {
  const fullSystem = `${system}\n\nRETURN FORMAT:\nReturn only valid JSON. No markdown fences or commentary.\nSchema: ${schemaHint}`;
  if (fullSystem.length + user.length > MAX_PROMPT_CHARS) return null;

  const trialId = options.trialId || "global";
  const transport = options.transport || defaultTransport;
  const validate = options.validate || ((value: unknown): value is T => isJsonContainer(value));
  let repairNote = "";

  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (!takeToken(trialId)) return null;
    try {
      const response = await transport({
        model: process.env.TRIAL_AI_MODEL || "google/gemini-2.5-flash-lite",
        temperature: 0.2,
        max_tokens: 900,
        messages: [
          { role: "system", content: fullSystem },
          { role: "user", content: `${user}${repairNote}` },
        ],
      });
      const content = response.choices?.[0]?.message?.content;
      if (typeof content === "string") {
        const parsed = parseJsonContent(content);
        if (parsed !== null && validate(parsed)) return parsed;
      }
    } catch {
      // One retry covers transient transport failures as well as malformed JSON.
    }
    repairNote = "\n\nYour previous response was malformed or did not match the schema. Return one strict JSON object now.";
  }
  return null;
}

/** Test helper: keeps rate-limit state from leaking between isolated test cases. */
export function resetTrialAiRateLimits(): void {
  buckets.clear();
}
