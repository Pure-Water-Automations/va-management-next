// Tiny env reader for the va-world server. No zod dependency — just defaults.
// Secrets/URLs are injected by the process environment (systemd / shell).

export const config = {
  /** Port the Colyseus server listens on. */
  port: Number(process.env.PORT ?? 2567),

  /** Base URL of the VA management app exposing /api/external/va-profile. */
  managerBaseUrl: process.env.MANAGER_BASE_URL?.replace(/\/$/, "") ?? "",

  /** Shared bearer secret for the manager's /api/external bridge. */
  externalAppSecret: process.env.EXTERNAL_APP_SECRET ?? "",

  /**
   * Dev-only fallback identity used when there is no Cloudflare Access header
   * and no ?email= join option. Empty in production.
   */
  devFallbackEmail: process.env.DEV_FALLBACK_EMAIL ?? "",

  /** CORS allow-list for the HTTP matchmaking endpoint. "*" in dev. */
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? "*",
} as const;
