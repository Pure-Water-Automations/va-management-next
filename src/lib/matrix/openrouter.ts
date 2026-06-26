import { env } from "@/lib/env";

export type ORResponse = {
  choices?: {
    message?: {
      content?: string;
      tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[];
    };
  }[];
};

// Closed/hosted models NVIDIA NIM does NOT serve — these must stay on OpenRouter.
const CLOSED_MODEL = /^(anthropic\/|openai\/|google\/|x-ai\/|cohere\/|gpt-|o\d)/i;

async function callChat(base: string, key: string, model: string, body: Record<string, unknown>): Promise<ORResponse> {
  const res = await fetch(`${base.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
    body: JSON.stringify({ ...body, model }),
  });
  if (!res.ok) {
    // Surface the API's own error message for debugging (never includes the key).
    const detail = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(`${res.status}: ${detail?.error?.message || "request failed"}`);
  }
  return (await res.json()) as ORResponse;
}

/**
 * OpenAI-compatible chat completion. NIM-first: open-weight, NON-tool-calling calls go
 * to the FREE NVIDIA NIM backend (see SecondBrain/tools/nvidia-nim/AGENTS.md) with
 * OpenRouter as the runtime fallback. Closed models (Claude/GPT, e.g. the enhance agent's
 * Claude Haiku) and tool-calling agents (matrix/secondbrain) stay on OpenRouter, where
 * cheap-model tool-call reliability isn't a risk.
 */
export async function openrouterChat(body: {
  messages: unknown[];
  tools?: unknown[];
  tool_choice?: unknown;
  temperature?: number;
  max_tokens?: number;
  // Optional per-call model override (e.g. the enhance agent uses Claude Haiku for
  // better grounded synthesis). Falls back to OPENROUTER_MATRIX_MODEL when unset.
  model?: string;
}): Promise<ORResponse> {
  const orKey = env.OPENROUTER_API_KEY?.trim();
  const orBase = env.OPENROUTER_BASE_URL?.replace(/\/+$/, "") || "https://openrouter.ai/api/v1";
  const orModel = body.model || env.OPENROUTER_MATRIX_MODEL || "deepseek/deepseek-chat-v3.1";

  const nimKey = env.NVIDIA_API_KEY?.trim();
  const nimBase = env.NVIDIA_BASE_URL?.replace(/\/+$/, "") || "https://integrate.api.nvidia.com/v1";
  const nimModel = env.NVIDIA_MATRIX_MODEL || "mistralai/mistral-small-4-119b-2603";
  const hasTools = Array.isArray(body.tools) && body.tools.length > 0;

  if (nimKey && !CLOSED_MODEL.test(orModel) && !hasTools) {
    try {
      return await callChat(nimBase, nimKey, nimModel, body);
    } catch (err) {
      if (!orKey) throw err; // no fallback available
      // NIM free-tier hiccup (429/402/5xx) → fall through to OpenRouter.
    }
  }

  if (!orKey) throw new Error("OpenRouter API key not configured");
  return callChat(orBase, orKey, orModel, body);
}
