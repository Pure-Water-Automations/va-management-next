import { test } from "node:test";
import assert from "node:assert/strict";
import { assertSignable } from "../src/lib/actions/contract";

const base = { currentStage: "contract_sent", contractDeadline: new Date(Date.now() + 86400000), signedAt: null as Date | null };

test("assertSignable passes for an open, in-window contract", () => {
  assert.doesNotThrow(() => assertSignable(base));
});
test("assertSignable rejects a wrong stage", () => {
  assert.throws(() => assertSignable({ ...base, currentStage: "onboarding" }), /already|not/i);
});
test("assertSignable rejects an expired link", () => {
  assert.throws(() => assertSignable({ ...base, contractDeadline: new Date(Date.now() - 1000) }), /expired/i);
});
