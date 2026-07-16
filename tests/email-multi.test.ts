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

test("replyTo emits a Reply-To header (positioned before To)", () => {
  const raw = buildMimeMessage({
    from: "admin@purewaterautomations.com",
    replyTo: "sales@purewaterautomations.com",
    to: "lead@church.org",
    subject: "t",
    body: "b",
  });
  const lines = raw.split("\r\n");
  const replyLine = lines.find((l) => l.startsWith("Reply-To:"));
  assert.ok(replyLine, "has a Reply-To header");
  assert.ok(replyLine!.includes("sales@purewaterautomations.com"));
  // Reply-To sits after From and before To.
  assert.ok(lines.indexOf("From: admin@purewaterautomations.com") < lines.indexOf(replyLine!));
  assert.ok(lines.indexOf(replyLine!) < lines.findIndex((l) => l.startsWith("To:")));
});

test("no Reply-To header when replyTo is omitted or blank", () => {
  const omitted = buildMimeMessage({ from: "a@x.com", to: "c@d.com", subject: "s", body: "b" });
  assert.doesNotMatch(omitted, /Reply-To:/);
  const blank = buildMimeMessage({ from: "a@x.com", replyTo: "   ", to: "c@d.com", subject: "s", body: "b" });
  assert.doesNotMatch(blank, /Reply-To:/);
});
