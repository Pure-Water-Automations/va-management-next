import { createHash, timingSafeEqual } from "node:crypto";

/** RFC 7636 S256: base64url(sha256(ascii(verifier))), no padding. */
export function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const a = Buffer.from(s256(verifier));
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
