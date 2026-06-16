import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMimeMessage } from "../src/lib/email";

test("a comma-separated To string becomes a valid multi-recipient header", () => {
  const raw = buildMimeMessage({
    from: "admin@x.com",
    to: "a@x.com, b@y.com, c@z.com",
    subject: "t",
    body: "b",
  });
  const toLine = raw.split("\r\n").find((l) => l.startsWith("To:"));
  assert.ok(toLine, "has a To header");
  assert.ok(toLine!.includes("a@x.com") && toLine!.includes("b@y.com") && toLine!.includes("c@z.com"));
});
