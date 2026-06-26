import { z } from "zod";

const optionalEnvString = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    schema.optional(),
  );

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_SECRET: z.string().min(1),
  NEXTAUTH_URL: optionalEnvString(z.string().url()),
  APP_BASE_URL: optionalEnvString(z.string().url()),
  DEV_AUTH_EMAIL: optionalEnvString(z.string().email()),
  GOOGLE_SERVICE_ACCOUNT_JSON: optionalEnvString(z.string().min(1)),
  GOOGLE_SERVICE_ACCOUNT_FILE: optionalEnvString(z.string().min(1)),
  SOURCE_SHEET_ID: optionalEnvString(z.string()),
  MIRROR_SHEET_ID: optionalEnvString(z.string()),
  APPLICATION_RESPONSES_SHEET_ID: optionalEnvString(z.string()),
  APPLICATION_RESPONSES_TAB: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().default("Form Responses 1"),
  ),
  GOOGLE_WORKSPACE_TOKEN_FILE: optionalEnvString(z.string()),
  GMAIL_SENDER_TOKEN_FILE: optionalEnvString(z.string()),
  GOOGLE_OAUTH_CLIENT_ID: optionalEnvString(z.string()),
  GOOGLE_OAUTH_CLIENT_SECRET: optionalEnvString(z.string()),
  OPENAI_API_KEY: optionalEnvString(z.string()),
  OPENAI_MODEL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().default("gpt-4o-mini"),
  ),
  OPENROUTER_API_KEY: optionalEnvString(z.string()),
  OPENROUTER_BASE_URL: optionalEnvString(z.string()),
  OPENROUTER_MATRIX_MODEL: optionalEnvString(z.string()),
  // Model for the transcript-to-tasks worker's action-item extraction. Defaults
  // to google/gemini-2.5-flash-lite in the worker when unset.
  OPENROUTER_TRANSCRIPT_MODEL: optionalEnvString(z.string()),
  // Model for the "Enhance with Second Brain" agent (brief synthesis). Defaults to
  // anthropic/claude-haiku-4.5 in code — better grounded synthesis than DeepSeek.
  // (claude-3.5-haiku was retired by OpenRouter/Bedrock 2026-06-20 → HTTP 404.)
  OPENROUTER_ENHANCE_MODEL: optionalEnvString(z.string()),
  OPENROUTER_ENHANCE_SEARCH_MODEL: optionalEnvString(z.string()),
  // NVIDIA NIM — FREE default backend (see SecondBrain/tools/nvidia-nim/AGENTS.md).
  // openrouterChat sends open-weight, non-tool-calling calls here first (free), with
  // OpenRouter as the runtime fallback. Closed models (Claude/GPT) and tool-calling
  // agents stay on OpenRouter. Wired via systemd EnvironmentFile=/etc/secondbrain/nvidia.env.
  NVIDIA_API_KEY: optionalEnvString(z.string()),
  NVIDIA_BASE_URL: optionalEnvString(z.string()),
  NVIDIA_MATRIX_MODEL: optionalEnvString(z.string()),
  // Notion two-way sync — public OAuth integration (one-click "Connect with
  // Notion"). All optional: when unset, the connect UI falls back to the manual
  // internal-integration-token flow. Redirect URI defaults to
  // ${APP_BASE_URL}/api/notion/oauth/callback.
  NOTION_OAUTH_CLIENT_ID: optionalEnvString(z.string()),
  NOTION_OAUTH_CLIENT_SECRET: optionalEnvString(z.string()),
  NOTION_OAUTH_REDIRECT_URI: optionalEnvString(z.string().url()),
  // MCP endpoint: shared bearer token + the service identity it acts as. The
  // /api/mcp endpoint is disabled (503) until MCP_API_TOKEN is set.
  MCP_API_TOKEN: optionalEnvString(z.string()),
  MCP_ACTOR_EMAIL: optionalEnvString(z.string().email()),
  // SecondBrain cloud MCP endpoint (co-located on the same VPS). Used by the
  // "Enhance with Second Brain" feature to search Notion/Drive/meeting mirrors.
  SECONDBRAIN_MCP_URL: optionalEnvString(z.string().url()),
  // Shared secret for trusted server-to-server callers (e.g. va-world) hitting
  // the read-only /api/external/* bridge. Never exposed to the browser.
  EXTERNAL_APP_SECRET: optionalEnvString(z.string().min(1)),
  // Stripe (client sales payments). All optional so the app boots without Stripe
  // configured; payment kickoff no-ops and falls back to manual "mark paid" until
  // the secret key is set. The webhook route is disabled unless the secret is set.
  // Payment mode: "mock" (default when unset) simulates an instant successful
  // payment on sign so the sign → paid → won → convert → onboard flow is testable
  // without Stripe; set "live" (+ STRIPE_SECRET_KEY) to send real invoices.
  STRIPE_MODE: optionalEnvString(z.string()),
  STRIPE_SECRET_KEY: optionalEnvString(z.string()),
  STRIPE_WEBHOOK_SECRET: optionalEnvString(z.string()),
  // Cheap multimodal model used to transcribe + summarize recording audio (via
  // OpenRouter input_audio). Gemini Flash-lite accepts audio and returns JSON with
  // timestamped segments for cheap (~$0.003 / 30-min recording). Fed compact mono
  // 16kHz mp3 extracted by ffmpeg (see worker/lib/media.ts).
  OPENROUTER_TRANSCRIBE_MODEL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().default("google/gemini-2.5-flash-lite"),
  ),
  // Cloudflare R2 (video storage for the in-app recorder). All optional so the
  // app still boots without R2 configured; recording features no-op until set.
  R2_ACCOUNT_ID: optionalEnvString(z.string()),
  R2_ACCESS_KEY_ID: optionalEnvString(z.string()),
  R2_SECRET_ACCESS_KEY: optionalEnvString(z.string()),
  R2_BUCKET: optionalEnvString(z.string()),
  R2_ENDPOINT: optionalEnvString(z.string().url()), // https://<accountid>.r2.cloudflarestorage.com
  R2_PUBLIC_BASE_URL: optionalEnvString(z.string().url()), // optional public/CDN base; unset => always presign
  // OpenAI speech-to-text model for recording transcripts.
  OPENAI_TRANSCRIBE_MODEL: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().default("whisper-1"),
  ),
  // Video Core — shared AI video-editing backend, loopback-only on this VPS
  // (127.0.0.1:3101). Powers the recording "Auto enhance" (tighten) feature. All
  // optional so the app boots without it; enhance no-ops until set.
  VIDEO_CORE_BASE_URL: optionalEnvString(z.string().url()),
  VIDEO_CORE_API_KEY: optionalEnvString(z.string()),
  VIDEO_CORE_WORKSPACE_ID: optionalEnvString(z.string()),
});

export const env = envSchema.parse(process.env);
