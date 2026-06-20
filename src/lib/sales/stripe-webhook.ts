import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify a Stripe webhook signature (dependency-free, mirrors Stripe's scheme).
 * Header format: `t=<unix>,v1=<hexsig>[,v1=<hexsig>...]`. The signed payload is
 * `<t>.<rawBody>`, HMAC-SHA256 with the endpoint secret, hex-encoded. Optionally
 * rejects signatures older than `toleranceSec`. Pure → unit-testable.
 */
export function verifyStripeSignature(
  rawBody: string,
  sigHeader: string | null,
  secret: string,
  opts?: { toleranceSec?: number; nowSec?: number },
): boolean {
  if (!sigHeader || !secret) return false;
  const parts = Object.fromEntries(
    sigHeader.split(",").map((kv) => {
      const i = kv.indexOf("=");
      return [kv.slice(0, i).trim(), kv.slice(i + 1).trim()];
    }),
  ) as Record<string, string>;
  const t = parts["t"];
  if (!t) return false;

  const v1s = sigHeader
    .split(",")
    .map((kv) => kv.split("="))
    .filter(([k]) => k.trim() === "v1")
    .map(([, v]) => (v ?? "").trim());
  if (v1s.length === 0) return false;

  const tolerance = opts?.toleranceSec ?? 300;
  if (tolerance > 0) {
    const now = opts?.nowSec ?? Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(t)) > tolerance) return false;
  }

  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  const expBuf = Buffer.from(expected, "utf8");
  return v1s.some((sig) => {
    const sigBuf = Buffer.from(sig, "utf8");
    return sigBuf.length === expBuf.length && timingSafeEqual(sigBuf, expBuf);
  });
}
