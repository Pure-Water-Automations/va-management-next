/**
 * Auth for the in-meeting Zoom App panel (Phase 2).
 *
 * The panel runs inside the Zoom client's embedded browser, where the console's
 * NextAuth/CF-Access session does NOT exist. Zoom instead sends an encrypted
 * `X-Zoom-App-Context` header on the initial page load. We decrypt it (Zoom's
 * documented AES-256-GCM scheme, key = SHA256(client secret)) to learn who opened
 * the panel (`uid` = Zoom user id) and in which meeting (`mid` = meeting UUID),
 * then mint our own short-lived HMAC token that the panel JS presents on every
 * subsequent API call (EventSource can't set headers, so it rides a query param).
 *
 * Pure crypto/encoding — no DB, no network — unit-tested in tests/zoom-panel-auth.test.ts.
 */
import crypto from "node:crypto";

// ── Zoom App context decryption ──────────────────────────────────────────────
// Buffer layout (Zoom's documented unpack, cf. their reference samples):
//   [ivLength u8][iv][aadLength u16 LE][aad][cipherLength u32 LE][cipherText][tag(16)]

export type ZoomAppContext = {
  typ?: string; // "meeting" | "panel" | ...
  uid?: string; // Zoom user id of the person who opened the app
  mid?: string; // meeting UUID (present when opened inside a meeting)
  ts?: number; // issued-at (ms since epoch)
  exp?: number; // optional expiry
  [key: string]: unknown;
};

export function decryptZoomAppContext(header: string, clientSecret: string): ZoomAppContext | null {
  if (!header || !clientSecret) return null;
  try {
    let buf = Buffer.from(header, "base64url");
    if (buf.length < 1) return null;
    const ivLength = buf.readUInt8(0);
    buf = buf.subarray(1);
    const iv = buf.subarray(0, ivLength);
    buf = buf.subarray(ivLength);
    const aadLength = buf.readUInt16LE(0);
    buf = buf.subarray(2);
    const aad = buf.subarray(0, aadLength);
    buf = buf.subarray(aadLength);
    const cipherLength = buf.readUInt32LE(0);
    buf = buf.subarray(4);
    const cipherText = buf.subarray(0, cipherLength);
    const tag = buf.subarray(cipherLength);
    if (iv.length !== ivLength || cipherText.length !== cipherLength || tag.length !== 16) return null;

    const key = crypto.createHash("sha256").update(clientSecret).digest();
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(cipherText), decipher.final()]).toString("utf8");
    const ctx = JSON.parse(plain) as ZoomAppContext;

    // Zoom includes an expiry on newer contexts; enforce it when present.
    if (typeof ctx.exp === "number") {
      const expMs = ctx.exp > 1e12 ? ctx.exp : ctx.exp * 1000; // tolerate s or ms
      if (expMs < Date.now()) return null;
    }
    return ctx;
  } catch {
    return null;
  }
}

// ── Panel session token (ours) ───────────────────────────────────────────────

export type PanelTokenPayload = {
  uid: string; // Zoom user id from the decrypted context
  mid: string; // meeting UUID the token is scoped to
  userId?: string; // mapped console User.id (absent for unmapped guests)
  name?: string; // display name for votes/logs
  exp: number; // ms since epoch
};

const b64url = (b: Buffer) => b.toString("base64url");
const PANEL_TOKEN_PREFIX = "zoom-panel-token:"; // domain separation for the HMAC

function tokenSig(body: string, secret: string): string {
  return b64url(crypto.createHmac("sha256", secret).update(PANEL_TOKEN_PREFIX + body).digest());
}

export const PANEL_TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // longer than any realistic meeting

export function mintPanelToken(
  payload: Omit<PanelTokenPayload, "exp">,
  secret: string,
  ttlMs = PANEL_TOKEN_TTL_MS,
): string {
  const body = b64url(Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + ttlMs }), "utf8"));
  return `${body}.${tokenSig(body, secret)}`;
}

export function verifyPanelToken(token: string, secret: string): PanelTokenPayload | null {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig || !secret) return null;
  const expected = tokenSig(body, secret);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
    return null;
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as PanelTokenPayload;
    if (!payload.uid || !payload.mid || typeof payload.exp !== "number") return null;
    if (payload.exp < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}
