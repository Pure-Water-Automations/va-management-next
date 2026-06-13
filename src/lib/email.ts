import { gmail as gmailApi } from "@googleapis/gmail";
import { OAuth2Client } from "google-auth-library";
import { env } from "@/lib/env";

export type SystemEmailOptions = {
  from: string;
  to: string | string[];
  subject: string;
  body: string;
  htmlBody?: string;
  tokenFile?: string;
};

export type SystemEmailResult =
  | { ok: true; id: string | null }
  | { ok: false; skipped: true; reason: string };

type TokenJson = Record<string, unknown>;

export async function sendSystemEmail(opts: SystemEmailOptions): Promise<SystemEmailResult> {
  const tokenFile = opts.tokenFile ?? env.GOOGLE_WORKSPACE_TOKEN_FILE;
  if (!tokenFile) {
    console.warn("sendSystemEmail skipped: GOOGLE_WORKSPACE_TOKEN_FILE is not configured.");
    return { ok: false, skipped: true, reason: "missing_token_file" };
  }

  const token = await readTokenJson(tokenFile);
  if (!token) {
    return { ok: false, skipped: true, reason: "unreadable_token_file" };
  }

  const auth = oauthClientFromToken(token);
  const gmail = gmailApi({ version: "v1", auth });
  const response = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      raw: base64UrlEncode(buildRawMessage(opts)),
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

function buildRawMessage(opts: SystemEmailOptions): string {
  const to = Array.isArray(opts.to) ? opts.to.join(", ") : opts.to;
  const headers = [
    ["From", sanitizeHeader(opts.from)],
    ["To", sanitizeHeader(to)],
    ["Subject", sanitizeHeader(opts.subject)],
    ["MIME-Version", "1.0"],
  ];

  if (!opts.htmlBody) {
    return [
      ...headers.map(([key, value]) => `${key}: ${value}`),
      'Content-Type: text/plain; charset="UTF-8"',
      "",
      opts.body,
    ].join("\r\n");
  }

  const boundary = `pwa-next-${Date.now().toString(36)}`;
  return [
    ...headers.map(([key, value]) => `${key}: ${value}`),
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    opts.body,
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    "",
    opts.htmlBody,
    `--${boundary}--`,
    "",
  ].join("\r\n");
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
