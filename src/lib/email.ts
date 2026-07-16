import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { currentActorEmail } from "@/lib/request-context";

/**
 * TEST MODE: when the `email_redirect_to` setting holds an address, every system
 * email is redirected there instead of its real recipient (subject/body are
 * annotated with the original recipient). Lets us test flows without mailing
 * real applicants/VAs. Empty setting = normal sending.
 */
/**
 * Decide where a system email actually goes in test mode (pure — unit-tested).
 * - actorMode off: use the fixed redirect address (or null = no redirect).
 * - actorMode on: redirect to whoever triggered the action, falling back to the
 *   fixed address when there's no actor (background workers).
 */
export function resolveRedirectTarget(opts: {
  redirectTo: string | null;
  actorMode: boolean;
  actorEmail?: string | null;
}): string | null {
  const fallback = opts.redirectTo?.trim() || null;
  if (opts.actorMode) return opts.actorEmail?.trim() || fallback;
  return fallback;
}

/**
 * Default Reply-To for system email (the `system_email_reply_to` Setting). Lets
 * replies land with sales/Justin while the From header stays admin@. Empty/unset
 * = no Reply-To header. Never throws (returns null on DB trouble).
 */
let replyToCache: { value: string | null; at: number } | null = null;
const REPLY_TO_TTL_MS = 60_000; // batch workers send in tight loops — don't re-query per message

async function systemReplyTo(): Promise<string | null> {
  if (replyToCache && Date.now() - replyToCache.at < REPLY_TO_TTL_MS) return replyToCache.value;
  try {
    const row = await db.setting.findUnique({
      where: { key: "system_email_reply_to" },
      select: { value: true },
    });
    replyToCache = { value: row?.value?.trim() || null, at: Date.now() };
    return replyToCache.value;
  } catch {
    return null;
  }
}

async function emailRedirectTo(): Promise<string | null> {
  try {
    const rows = await db.setting.findMany({
      where: { key: { in: ["email_redirect_to", "email_redirect_to_actor"] } },
      select: { key: true, value: true },
    });
    const map = new Map(rows.map((r) => [r.key, (r.value || "").trim()]));
    const actorMode = (map.get("email_redirect_to_actor") || "").toUpperCase() === "TRUE";
    return resolveRedirectTarget({
      redirectTo: map.get("email_redirect_to") || null,
      actorMode,
      actorEmail: currentActorEmail(),
    });
  } catch {
    return null;
  }
}

export type SystemEmailOptions = {
  from: string;
  replyTo?: string;
  to: string | string[];
  subject: string;
  body: string;
  htmlBody?: string;
  attachments?: { filename: string; content: Buffer; mimeType: string }[];
  tokenFile?: string;
};

export type SystemEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: true; reason: string };

type TokenJson = Record<string, unknown>;

export async function sendSystemEmail(opts: SystemEmailOptions): Promise<SystemEmailResult> {
  const tokenFile = opts.tokenFile ?? env.GMAIL_SENDER_TOKEN_FILE ?? env.GOOGLE_WORKSPACE_TOKEN_FILE;
  if (!tokenFile) {
    console.warn("sendSystemEmail skipped: GOOGLE_WORKSPACE_TOKEN_FILE is not configured.");
    return { ok: false, skipped: true, reason: "missing_token_file" };
  }

  const token = await readTokenJson(tokenFile);
  if (!token) {
    return { ok: false, skipped: true, reason: "unreadable_token_file" };
  }

  // Fall back to the system_email_reply_to Setting when the caller didn't pass one.
  const replyTo = opts.replyTo?.trim() || (await systemReplyTo()) || undefined;
  const withReplyTo: SystemEmailOptions = replyTo ? { ...opts, replyTo } : opts;

  const redirect = await emailRedirectTo();
  const effective: SystemEmailOptions = redirect
    ? {
        ...withReplyTo,
        to: redirect,
        subject: `[TEST] ${opts.subject}`,
        body: `⚠️ TEST MODE — this email would normally go to: ${Array.isArray(opts.to) ? opts.to.join(", ") : opts.to}\n\n${opts.body}`,
        htmlBody: opts.htmlBody
          ? `<p style="color:#999;font-size:13px">⚠️ TEST MODE — normally to: ${Array.isArray(opts.to) ? opts.to.join(", ") : opts.to}</p>${opts.htmlBody}`
          : undefined,
      }
    : withReplyTo;

  // NOTE: we send via direct fetch to the Gmail REST API rather than through
  // @googleapis/gmail + google-auth-library. On Node 24 the bundled gaxios 6.x
  // throws "Invalid response body … Premature close" on every Google API call
  // (token refresh AND send), while native fetch to the same endpoints works.
  // Refreshing + sending ourselves sidesteps that broken transport entirely.
  const accessToken = await fetchAccessToken(token);
  if (!accessToken) {
    return { ok: false, skipped: true, reason: "no_access_token" };
  }

  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ raw: base64UrlEncode(buildMimeMessage(effective)) }),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new Error(`Gmail send failed (${res.status}): ${detail}`);
  }
  const data = (await res.json().catch(() => ({}))) as { id?: string };
  return { ok: true, id: data.id ?? null };
}

/**
 * Get a usable access token for the Gmail send. Uses the cached token while it's
 * still valid, otherwise refreshes via a direct POST to Google's token endpoint
 * (native fetch — avoids the broken gaxios transport, see sendSystemEmail).
 */
async function fetchAccessToken(token: TokenJson): Promise<string | null> {
  const cached = readString(token, ["access_token"]);
  const expiry = readNumber(token, ["expiry_date"]);
  if (cached && expiry && Date.now() < expiry - 60_000) return cached;

  const clientId = readString(token, ["client_id"]) ?? readNestedString(token, "installed", "client_id");
  const clientSecret =
    readString(token, ["client_secret"]) ?? readNestedString(token, "installed", "client_secret");
  const refreshToken =
    readString(token, ["refresh_token"]) ?? readNestedString(token, "credentials", "refresh_token");
  if (!clientId || !clientSecret || !refreshToken) return cached;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }).toString(),
  });
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 200);
    throw new Error(`OAuth token refresh failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? cached;
}

async function readTokenJson(tokenFile: string): Promise<TokenJson | null> {
  const [{ readFile }, { isAbsolute, resolve }] = await Promise.all([
    import("fs/promises"),
    import("path"),
  ]);
  const resolvedPath = isAbsolute(tokenFile) ? tokenFile : resolve(process.cwd(), tokenFile);

  try {
    const raw = await readFile(resolvedPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed)) return parsed;
    console.warn(`sendSystemEmail skipped: token file is not a JSON object: ${resolvedPath}`);
  } catch (err) {
    console.warn(`sendSystemEmail skipped: cannot read token file ${resolvedPath}: ${errorMessage(err)}`);
  }

  return null;
}

export function buildMimeMessage(opts: SystemEmailOptions): string {
  const to = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
  const headers = [
    ["From", sanitizeHeader(opts.from)],
    ...(opts.replyTo?.trim() ? [["Reply-To", sanitizeHeader(opts.replyTo)]] : []),
    ["To", sanitizeHeader(to)],
    ["Subject", encodeHeaderWord(opts.subject)],
    ["MIME-Version", "1.0"],
  ];
  const headerLines = headers.map(([key, value]) => `${key}: ${value}`);

  const bodyPart = (): string[] => {
    if (!opts.htmlBody) {
      return ['Content-Type: text/plain; charset="UTF-8"', "", opts.body];
    }
    const alt = `alt-${Date.now().toString(36)}`;
    return [
      `Content-Type: multipart/alternative; boundary="${alt}"`,
      "",
      `--${alt}`,
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      opts.body,
      `--${alt}`,
      'Content-Type: text/html; charset="UTF-8"',
      "",
      opts.htmlBody,
      `--${alt}--`,
    ];
  };

  if (!opts.attachments || opts.attachments.length === 0) {
    return [...headerLines, ...bodyPart(), ""].join("\r\n");
  }

  const mixed = `mixed-${Date.now().toString(36)}`;
  const parts: string[] = [
    ...headerLines,
    `Content-Type: multipart/mixed; boundary="${mixed}"`,
    "",
    `--${mixed}`,
    ...bodyPart(),
  ];
  for (const a of opts.attachments) {
    parts.push(
      `--${mixed}`,
      `Content-Type: ${a.mimeType}; name="${a.filename}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${a.filename}"`,
      "",
      a.content.toString("base64").replace(/(.{76})/g, "$1\r\n"),
    );
  }
  parts.push(`--${mixed}--`, "");
  return parts.join("\r\n");
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, " ").trim();
}

/**
 * RFC 2047 "encoded-word" for header values containing non-ASCII (em-dashes,
 * accented names, emoji). Without this, raw UTF-8 bytes in a Subject header are
 * misread by mail clients and show up as mojibake (Ã¢Â€Â…). ASCII values pass
 * through unchanged. Long values are split into ≤75-char words on UTF-8
 * character boundaries, as the spec requires.
 */
function encodeHeaderWord(value: string): string {
  const clean = sanitizeHeader(value);
  if (/^[\x00-\x7F]*$/.test(clean)) return clean;
  const chunks: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of clean) {
    const b = Buffer.byteLength(ch, "utf8");
    if (curBytes + b > 45) {
      chunks.push(cur);
      cur = "";
      curBytes = 0;
    }
    cur += ch;
    curBytes += b;
  }
  if (cur) chunks.push(cur);
  return chunks.map((c) => `=?UTF-8?B?${Buffer.from(c, "utf8").toString("base64")}?=`).join("\r\n ");
}

function readString(obj: TokenJson, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function readNestedString(obj: TokenJson, key: string, nestedKey: string): string | null {
  const nested = obj[key];
  if (!isRecord(nested)) return null;
  const value = nested[nestedKey];
  return typeof value === "string" && value.trim() ? value : null;
}

function readNumber(obj: TokenJson, keys: readonly string[]): number | null {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return null;
}

function isRecord(value: unknown): value is TokenJson {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
