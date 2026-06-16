import { gmail as gmailApi } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";
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

  const redirect = await emailRedirectTo();
  const effective: SystemEmailOptions = redirect
    ? {
        ...opts,
        to: redirect,
        subject: `[TEST] ${opts.subject}`,
        body: `⚠️ TEST MODE — this email would normally go to: ${Array.isArray(opts.to) ? opts.to.join(", ") : opts.to}\n\n${opts.body}`,
        htmlBody: opts.htmlBody
          ? `<p style="color:#999;font-size:13px">⚠️ TEST MODE — normally to: ${Array.isArray(opts.to) ? opts.to.join(", ") : opts.to}</p>${opts.htmlBody}`
          : undefined,
      }
    : opts;

  const auth = oauthClientFromToken(token);
  const gmail = gmailApi({ version: "v1", auth });
  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: base64UrlEncode(buildMimeMessage(effective)),
    },
  });

  return { ok: true, id: response.data.id ?? null };
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

function oauthClientFromToken(token: TokenJson): OAuth2Client {
  const clientId = readString(token, ["client_id"]) ?? readNestedString(token, "installed", "client_id");
  const clientSecret =
    readString(token, ["client_secret"]) ?? readNestedString(token, "installed", "client_secret");
  const refreshToken =
    readString(token, ["refresh_token"]) ?? readNestedString(token, "credentials", "refresh_token");

  const auth = new OAuth2Client(clientId ?? undefined, clientSecret ?? undefined);
  auth.setCredentials({
    access_token: readString(token, ["access_token"]) ?? undefined,
    expiry_date: readNumber(token, ["expiry_date"]) ?? undefined,
    refresh_token: refreshToken ?? undefined,
    scope: readString(token, ["scope"]) ?? undefined,
    token_type: readString(token, ["token_type"]) ?? undefined,
  });
  return auth;
}

export function buildMimeMessage(opts: SystemEmailOptions): string {
  const to = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
  const headers = [
    ["From", sanitizeHeader(opts.from)],
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
