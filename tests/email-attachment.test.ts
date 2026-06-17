import { test } from "node:test";
import assert from "node:assert/strict";
import { buildMimeMessage } from "../src/lib/email";

test("buildMimeMessage wraps an attachment in multipart/mixed", () => {
  const raw = buildMimeMessage({
    from: "a@b.com",
    to: "c@d.com",
    subject: "Signed contract",
    body: "See attached.",
    attachments: [
      { filename: "contract.pdf", content: Buffer.from("%PDF-1.7 fake"), mimeType: "application/pdf" },
    ],
  });
  assert.match(raw, /Content-Type: multipart\/mixed; boundary=/);
  assert.match(raw, /Content-Type: application\/pdf/);
  assert.match(raw, /Content-Disposition: attachment; filename="contract.pdf"/);
  assert.match(raw, /Content-Transfer-Encoding: base64/);
  assert.match(raw, new RegExp(Buffer.from("%PDF-1.7 fake").toString("base64")));
});

test("buildMimeMessage with no attachment keeps plain text", () => {
  const raw = buildMimeMessage({ from: "a@b.com", to: "c@d.com", subject: "Hi", body: "Body" });
  assert.match(raw, /Content-Type: text\/plain/);
  assert.doesNotMatch(raw, /multipart\/mixed/);
});
