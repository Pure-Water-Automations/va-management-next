import { test } from "node:test";
import assert from "node:assert/strict";
import { safePath, readSource } from "../src/lib/matrix/code-access";

test("safePath allows files under src/", () => {
  assert.doesNotThrow(() => safePath("src/lib/db.ts"));
});
test("safePath rejects traversal", () => {
  assert.throws(() => safePath("../../etc/passwd"), /outside/i);
});
test("safePath rejects .env and secrets", () => {
  assert.throws(() => safePath(".env"), /off-limits/i);
  assert.throws(() => safePath("src/lib/.env.local"), /off-limits/i);
  assert.throws(() => safePath(".secrets/token.json"), /off-limits/i);
});
test("safePath rejects token / service-account files even under allowed dirs", () => {
  assert.throws(() => safePath("src/lib/google-token.json"), /off-limits/i);
  assert.throws(() => safePath("prisma/service-account.json"), /off-limits/i);
});
test("safePath rejects dirs that aren't allow-listed", () => {
  assert.throws(() => safePath("node_modules/x"), /off-limits|readable/i);
  assert.throws(() => safePath("design-system/x"), /readable/i);
});
test("readSource returns file contents (truncated)", async () => {
  const txt = await readSource("package.json");
  assert.ok(txt.includes("va-management-next"));
});
