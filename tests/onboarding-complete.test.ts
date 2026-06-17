import { test } from "node:test";
import assert from "node:assert/strict";
import { welcomeEmailBody } from "../src/lib/actions/onboarding";

test("welcomeEmailBody greets the VA by first name", () => {
  const body = welcomeEmailBody("Ana Cruz", "Pure Water Automations");
  assert.match(body, /Hi Ana/);
  assert.match(body, /Pure Water Automations/);
});
