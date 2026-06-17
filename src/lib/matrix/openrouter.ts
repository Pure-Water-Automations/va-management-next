import { env } from "@/lib/env";

export type ORResponse = {
  choices?: {
    message?: {
      content?: string;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
};

/** OpenAI-compatible chat completion against OpenRouter (DeepSeek by default). */
export async function openrouterChat(body: {
  messages: unknown[];
  tools?: unknown[];
  tool_choice?: unknown;
  temperature?: number;
  max_tokens?: number;
}): Promise<ORResponse> {
  if (!env.OPENROUTER_API_KEY?.trim()) throw new Error("OpenRouter API key not configured");
  const base = env.OPENROUTER_BASE_URL?.replace(/\/+$/, "") || "https://openrouter.ai/api/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MATRIX_MODEL || "deepseek/deepseek-chat-v3.1",
      ...body,
    }),
  });
  if (!res.ok) {
    // Surface the API's own error message for debugging (never includes the key).
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`OpenRouter ${res.status}: ${detail?.error?.message || "request failed"}`);
  }
  return (await res.json()) as ORResponse;
}
