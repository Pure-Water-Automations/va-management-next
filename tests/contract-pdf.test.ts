import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSignedPdf } from "../src/lib/contract/pdf";

test("generateSignedPdf returns a PDF buffer", async () => {
  const buf = await generateSignedPdf({
    contentHtml: "<h1>Agreement</h1><p>Ana Cruz agrees.</p><ul><li>Term one</li></ul>",
    signerName: "Ana Cruz",
    signatureImage: null,
    audit: { signedAt: "2026-06-15T10:00:00Z", signerIp: "1.2.3.4", userAgent: "test-agent", templateHash: "abc123", subjectId: "cand_1", subjectLabel: "candidate" },
  });
  assert.ok(Buffer.isBuffer(buf));
  assert.ok(buf.length > 500);
  assert.equal(buf.subarray(0, 5).toString("latin1"), "%PDF-");
});
