import test from "node:test";
import assert from "node:assert/strict";

import {
  MAX_DISCOVERY_ATTACHMENT_BYTES,
  validateDiscoveryAttachments,
} from "../src/lib/discovery-attachment-validation";

const allowed = [
  ["scope.pdf", "application/pdf"],
  ["brief.doc", "application/msword"],
  ["plan.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ["notes.txt", "text/plain"],
  ["diagram.png", "image/png"],
  ["photo.jpg", "image/jpeg"],
] as const;

test("discovery attachments accept the exact file extension and type allowlist", () => {
  for (const [name, type] of allowed) {
    const result = validateDiscoveryAttachments([{ name, type, size: 1_024 }]);
    assert.equal(result.ok, true, name);
  }
});

test("discovery attachments accept an empty browser MIME type and use the extension type", () => {
  const result = validateDiscoveryAttachments([{ name: "scope.PDF", type: "", size: 1_024 }]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.files[0].contentType, "application/pdf");
});

test("discovery attachments reject more than three files", () => {
  const files = Array.from({ length: 4 }, (_, index) => ({
    name: `notes-${index}.txt`,
    type: "text/plain",
    size: 100,
  }));
  const result = validateDiscoveryAttachments(files);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /up to 3/i);
});

test("discovery attachments enforce the 10 MB per-file limit", () => {
  assert.equal(validateDiscoveryAttachments([{
    name: "at-limit.pdf",
    type: "application/pdf",
    size: MAX_DISCOVERY_ATTACHMENT_BYTES,
  }]).ok, true);

  const result = validateDiscoveryAttachments([{
    name: "too-large.pdf",
    type: "application/pdf",
    size: MAX_DISCOVERY_ATTACHMENT_BYTES + 1,
  }]);
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /larger than 10 MB/i);
});

test("discovery attachments reject disallowed extensions and mismatched MIME types", () => {
  assert.equal(validateDiscoveryAttachments([{
    name: "archive.zip",
    type: "application/zip",
    size: 100,
  }]).ok, false);
  assert.equal(validateDiscoveryAttachments([{
    name: "renamed.pdf",
    type: "image/png",
    size: 100,
  }]).ok, false);
  assert.equal(validateDiscoveryAttachments([{
    name: "alternate.jpeg",
    type: "image/jpeg",
    size: 100,
  }]).ok, false);
});
