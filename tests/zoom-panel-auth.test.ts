import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  decryptZoomAppContext,
  mintPanelToken,
  verifyPanelToken,
  type ZoomAppContext,
} from "../src/lib/zoom/panel-auth";

const SECRET = "zoom_client_secret_for_tests";

/** Encrypt a context exactly the way Zoom packs X-Zoom-App-Context. */
function encryptContext(ctx: ZoomAppContext, secret: string): string {
  const iv = crypto.randomBytes(12);
  const aad = Buffer.from(JSON.stringify({ typ: ctx.typ ?? "meeting" }), "utf8");
  const key = crypto.createHash("sha256").update(secret).digest();
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv, { authTagLength: 16 });
  cipher.setAAD(aad);
  const cipherText = Buffer.concat([cipher.update(JSON.stringify(ctx), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  const ivLen = Buffer.alloc(1);
  ivLen.writeUInt8(iv.length, 0);
  const aadLen = Buffer.alloc(2);
  aadLen.writeUInt16LE(aad.length, 0);
  const cipherLen = Buffer.alloc(4);
  cipherLen.writeUInt32LE(cipherText.length, 0);
  return Buffer.concat([ivLen, iv, aadLen, aad, cipherLen, cipherText, tag]).toString("base64url");
}

test("decryptZoomAppContext: round-trips a packed context", () => {
  const ctx: ZoomAppContext = { typ: "meeting", uid: "zoom-uid-1", mid: "meeting-uuid-1", ts: Date.now() };
  const header = encryptContext(ctx, SECRET);
  const out = decryptZoomAppContext(header, SECRET);
  assert.ok(out);
  assert.equal(out.uid, "zoom-uid-1");
  assert.equal(out.mid, "meeting-uuid-1");
});

test("decryptZoomAppContext: wrong secret / tampered header / garbage → null", () => {
  const header = encryptContext({ typ: "meeting", uid: "u", mid: "m" }, SECRET);
  assert.equal(decryptZoomAppContext(header, "other_secret"), null);
  const tampered = header.slice(0, -4) + (header.endsWith("AAAA") ? "BBBB" : "AAAA");
  assert.equal(decryptZoomAppContext(tampered, SECRET), null);
  assert.equal(decryptZoomAppContext("not-a-context", SECRET), null);
  assert.equal(decryptZoomAppContext("", SECRET), null);
});

test("decryptZoomAppContext: expired context (exp in seconds or ms) → null", () => {
  const pastSec = Math.floor(Date.now() / 1000) - 60;
  assert.equal(decryptZoomAppContext(encryptContext({ uid: "u", mid: "m", exp: pastSec }, SECRET), SECRET), null);
  const pastMs = Date.now() - 60_000;
  assert.equal(decryptZoomAppContext(encryptContext({ uid: "u", mid: "m", exp: pastMs }, SECRET), SECRET), null);
  const futureSec = Math.floor(Date.now() / 1000) + 600;
  assert.ok(decryptZoomAppContext(encryptContext({ uid: "u", mid: "m", exp: futureSec }, SECRET), SECRET));
});

test("panel token: mint → verify round-trip with identity fields", () => {
  const token = mintPanelToken({ uid: "zu", mid: "mu", userId: "u1", name: "Justin" }, SECRET);
  const out = verifyPanelToken(token, SECRET);
  assert.ok(out);
  assert.equal(out.uid, "zu");
  assert.equal(out.mid, "mu");
  assert.equal(out.userId, "u1");
  assert.ok(out.exp > Date.now());
});

test("panel token: tampered payload or signature rejected", () => {
  const token = mintPanelToken({ uid: "zu", mid: "mu" }, SECRET);
  const [body, sig] = token.split(".");
  const otherBody = Buffer.from(JSON.stringify({ uid: "evil", mid: "mu", exp: Date.now() + 1e6 })).toString(
    "base64url",
  );
  assert.equal(verifyPanelToken(`${otherBody}.${sig}`, SECRET), null);
  assert.equal(verifyPanelToken(`${body}.${sig}x`, SECRET), null);
  assert.equal(verifyPanelToken(token, "wrong-secret"), null);
  assert.equal(verifyPanelToken("garbage", SECRET), null);
});

test("panel token: expiry enforced", () => {
  const token = mintPanelToken({ uid: "zu", mid: "mu" }, SECRET, -1000);
  assert.equal(verifyPanelToken(token, SECRET), null);
});
