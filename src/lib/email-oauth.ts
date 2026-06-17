import { OAuth2Client } from "google-auth-library";
import { env } from "@/lib/env";

export const SENDER_SCOPES = [
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/userinfo.email",
];

export function senderTokenPath(): string {
  return env.GMAIL_SENDER_TOKEN_FILE || ".secrets/email-sender-token.json";
}

export function redirectUri(): string {
  const base = env.APP_BASE_URL || "https://team.pwasecondbrain.uk";
  return `${base.replace(/\/+$/, "")}/api/email-auth/callback`;
}

export function oauthClient(): OAuth2Client | null {
  if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) return null;
  return new OAuth2Client(env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET, redirectUri());
}

/** Read the connected sender account email + scope, if a token is saved. */
export async function senderStatus(): Promise<{ connected: boolean; email?: string; path: string }> {
  const path = senderTokenPath();
  try {
    const { readFile } = await import("fs/promises");
    const raw = await readFile(path, "utf8");
    const t = JSON.parse(raw) as { email?: string; account?: string };
    return { connected: true, email: t.email ?? t.account, path };
  } catch {
    return { connected: false, path };
  }
}
