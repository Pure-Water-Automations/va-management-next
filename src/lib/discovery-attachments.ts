import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const DISCOVERY_UPLOAD_EXPIRES_SECONDS = 600;
const SUBMISSION_GRANT_TTL_SECONDS = 15 * 60;

type AttachmentGrant = {
  kind: "submit" | "confirm";
  dealId: string;
  expiresAt: number;
  keys?: string[];
};

export class DiscoveryAttachmentError extends Error {}

function encodeGrant(payload: AttachmentGrant, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

export function createDiscoverySubmissionGrant(dealId: string, secret: string): string {
  return encodeGrant({
    kind: "submit",
    dealId,
    expiresAt: Math.floor(Date.now() / 1000) + SUBMISSION_GRANT_TTL_SECONDS,
  }, secret);
}

export function createDiscoveryConfirmGrant(dealId: string, keys: string[], secret: string): string {
  return encodeGrant({
    kind: "confirm",
    dealId,
    keys,
    expiresAt: Math.floor(Date.now() / 1000) + DISCOVERY_UPLOAD_EXPIRES_SECONDS,
  }, secret);
}

export function verifyDiscoveryAttachmentGrant(token: string, secret: string): AttachmentGrant | null {
  const [body, suppliedSignature, extra] = token.split(".");
  if (!body || !suppliedSignature || extra) return null;
  const expectedSignature = createHmac("sha256", secret).update(body).digest();
  let actualSignature: Buffer;
  try {
    actualSignature = Buffer.from(suppliedSignature, "base64url");
  } catch {
    return null;
  }
  if (actualSignature.length !== expectedSignature.length || !timingSafeEqual(actualSignature, expectedSignature)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Partial<AttachmentGrant>;
    if ((parsed.kind !== "submit" && parsed.kind !== "confirm") || typeof parsed.dealId !== "string" || !parsed.dealId) return null;
    if (typeof parsed.expiresAt !== "number" || parsed.expiresAt < Math.floor(Date.now() / 1000)) return null;
    if (parsed.kind === "confirm" && (!Array.isArray(parsed.keys) || parsed.keys.some((key) => typeof key !== "string"))) return null;
    return parsed as AttachmentGrant;
  } catch {
    return null;
  }
}

function safeFileName(name: string): string {
  const leaf = name.split(/[\\/]/).pop() || "attachment";
  const cleaned = leaf
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(-120);
  return cleaned || "attachment";
}

export function discoveryAttachmentKey(dealId: string, name: string): string {
  return `discovery/${dealId}/${randomUUID()}-${safeFileName(name)}`;
}

export function isDiscoveryAttachmentKey(key: string, dealId: string): boolean {
  const prefix = `discovery/${dealId}/`;
  const remainder = key.startsWith(prefix) ? key.slice(prefix.length) : "";
  return Boolean(remainder && !remainder.includes("/") && !remainder.includes("\\"));
}

export function discoveryAttachmentName(key: string): string {
  const leaf = key.split("/").pop() || "attachment";
  return leaf.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}-/i, "") || "attachment";
}

type RateBucket = { count: number; resetAt: number };
const rateState = globalThis as typeof globalThis & { __discoverRateLimits?: Map<string, RateBucket> };
const buckets = rateState.__discoverRateLimits ??= new Map<string, RateBucket>();

/** Small in-process guard matching both public discovery endpoints. */
export function checkDiscoveryRateLimit(
  request: Request,
  scope: "submit" | "attachment",
): { ok: true } | { ok: false; retryAfter: number } {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const limit = scope === "submit" ? 10 : 30;
  const ip = request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    ?? "unknown";
  const key = `${scope}:${ip}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true };
  }
  if (current.count >= limit) {
    return { ok: false, retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000)) };
  }
  current.count += 1;
  if (buckets.size > 2_000) {
    for (const [bucketKey, bucket] of buckets) if (bucket.resetAt <= now) buckets.delete(bucketKey);
  }
  return { ok: true };
}
