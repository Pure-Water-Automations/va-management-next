import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeChatText } from "../server/src/chat";

test("sanitizeChatText trims and rejects non-strings", () => {
  assert.equal(sanitizeChatText("  hi  "), "hi");
  assert.equal(sanitizeChatText("   "), "");
  assert.equal(sanitizeChatText(42), "");
  assert.equal(sanitizeChatText(undefined), "");
});

test("sanitizeChatText caps length", () => {
  assert.equal(sanitizeChatText("x".repeat(1000), 500).length, 500);
});
