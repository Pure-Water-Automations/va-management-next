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
  const base = env.OPENROUTER_BASE_URL?.replace(/\/+$/, "") || "https://openrouter.ai/api/v1";
  const res = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${env.OPENROUTER_API_KEY ?? ""}`,
    },
    body: JSON.stringify({
      model: env.OPENROUTER_MATRIX_MODEL || "deepseek/deepseek-chat-v3.1",
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}`);
  return (await res.json()) as ORResponse;
}
