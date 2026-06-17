import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePreTrialResult, preTrialNextStage } from "../src/lib/actions/recruitment";

test("parsePreTrialResult accepts approve/decline", () => {
  assert.equal(parsePreTrialResult("approve"), "approve");
  assert.equal(parsePreTrialResult("decline"), "decline");
});
test("parsePreTrialResult rejects anything else", () => {
  assert.throws(() => parsePreTrialResult("maybe"), /invalid pre-trial/i);
  assert.throws(() => parsePreTrialResult(""), /invalid pre-trial/i);
});
test("approve sends the candidate into the trial", () => {
  assert.equal(preTrialNextStage("approve"), "tenhr_in_progress");
});
test("decline sends the candidate back to the waitlist (decision)", () => {
  assert.equal(preTrialNextStage("decline"), "decision");
});
