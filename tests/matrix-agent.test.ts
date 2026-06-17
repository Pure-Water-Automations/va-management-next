import { test } from "node:test";
import assert from "node:assert/strict";
import { matrixAct } from "../src/lib/matrix/agent";
import type { ORResponse } from "../src/lib/matrix/openrouter";

// A mock chat that returns queued responses in order.
function mockChat(queue: ORResponse[]) {
  let i = 0;
  return async () => queue[Math.min(i++, queue.length - 1)];
}
const answer = (text: string): ORResponse => ({ choices: [{ message: { content: text } }] });
const toolCall = (name: string, args: object): ORResponse => ({
  choices: [{ message: { tool_calls: [{ id: "c1", function: { name, arguments: JSON.stringify(args) } }] } }],
});

test("returns an answer when the model emits no tool call", async () => {
  const r = await matrixAct("hi", "HR_MANAGER", "a@x.com", mockChat([answer("Hello!")]));
  assert.deepEqual(r, { type: "answer", text: "Hello!" });
});

test("auto-runs a code read tool, then answers", async () => {
  const r = await matrixAct("what's in package.json?", "HR_MANAGER", "a@x.com",
    mockChat([toolCall("read_source", { path: "package.json" }), answer("It's the project manifest.")]));
  assert.equal(r.type, "answer");
});

test("a write tool becomes a confirmable proposal (no DB needed for recalc_payroll)", async () => {
  const r = await matrixAct("recalc payroll", "HR_MANAGER", "a@x.com",
    mockChat([toolCall("recalc_payroll", {})]));
  assert.equal(r.type, "proposal");
  if (r.type === "proposal") assert.equal(r.proposal.tool, "recalc_payroll");
});

test("an invalid edit_record is fed back, not crashed", async () => {
  const r = await matrixAct("hack the users", "HR_MANAGER", "a@x.com",
    mockChat([toolCall("edit_record", { model: "User", where: { id: "x" }, data: { isAdmin: true } }), answer("I can't touch logins.")]));
  assert.equal(r.type, "answer"); // recovered
});

test("honors the step cap with a model that never stops reading", async () => {
  const r = await matrixAct("loop", "HR_MANAGER", "a@x.com",
    mockChat([toolCall("read_source", { path: "package.json" })])); // same read forever
  assert.equal(r.type, "answer"); // returns the cap message
});
