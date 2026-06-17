import { test } from "node:test";
import assert from "node:assert/strict";
import { config } from "../server/src/env";
import { WORLD_ROOM, mintToken } from "../server/src/livekit";

const writable = config as { livekitUrl: string; livekitApiKey: string; livekitApiSecret: string };

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  const payload = jwt.split(".")[1];
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
}

test("mintToken returns null when LiveKit isn't configured", async () => {
  writable.livekitUrl = "";
  writable.livekitApiKey = "";
  writable.livekitApiSecret = "";
  assert.equal(await mintToken("session-1", "Alice"), null);
});

test("mintToken issues a JWT scoped to the world room with the given identity", async () => {
  writable.livekitUrl = "wss://test.livekit.cloud";
  writable.livekitApiKey = "APIkey";
  writable.livekitApiSecret = "secretsecretsecretsecret";

  const jwt = await mintToken("session-42", "Bob");
  assert.ok(jwt, "expected a token");

  const payload = decodeJwtPayload(jwt as string);
  assert.equal(payload.sub, "session-42");
  const grant = payload.video as { room?: string; roomJoin?: boolean };
  assert.equal(grant.room, WORLD_ROOM);
  assert.equal(grant.roomJoin, true);
});
