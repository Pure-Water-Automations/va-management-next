import test from "node:test";
import assert from "node:assert/strict";

import {
  parseMeetingFile,
  shouldProcess,
  parseExtractedItems,
  buildExtractionMessages,
} from "../src/lib/meetings/extract";

const SAMPLE = `---
title: "Aira & Oakwood Check-in"
zoom_account: "Northeast"
recording_start: "2026-06-19T23:58:27Z"
harvested_at: "2026-06-20T01:37:42.039Z"
---

# Aira & Oakwood Check-in

## Transcript

**[00:58] Aira:** "We'll send the proposal Friday."`;

test("parseMeetingFile: pulls title, account, date, body", () => {
  const m = parseMeetingFile(SAMPLE);
  assert.equal(m.title, "Aira & Oakwood Check-in");
  assert.equal(m.zoomAccount, "Northeast");
  assert.equal(m.date?.toISOString(), "2026-06-19T23:58:27.000Z");
  assert.match(m.body, /Transcript/);
  assert.doesNotMatch(m.body, /zoom_account/); // frontmatter stripped
});

test("parseMeetingFile: falls back to meeting_date when no recording_start", () => {
  const md = `---\ntitle: "X"\nzoom_account: "Business (BFC)"\nmeeting_date: "2026-05-01"\n---\nbody`;
  const m = parseMeetingFile(md);
  assert.equal(m.date?.toISOString().slice(0, 10), "2026-05-01");
});

test("parseMeetingFile: missing frontmatter → empty meta, body intact", () => {
  const m = parseMeetingFile("no frontmatter here");
  assert.equal(m.title, "");
  assert.equal(m.zoomAccount, null);
  assert.equal(m.date, null);
  assert.equal(m.body, "no frontmatter here");
});

test("shouldProcess: in-scope account passes", () => {
  assert.equal(shouldProcess({ zoomAccount: "Northeast", title: "Client Sync" }), true);
  assert.equal(shouldProcess({ zoomAccount: "Business (BFC)", title: "X" }), true);
});

test("shouldProcess: out-of-scope account rejected", () => {
  assert.equal(shouldProcess({ zoomAccount: "PWA", title: "X" }), false);
  assert.equal(shouldProcess({ zoomAccount: null, title: "X" }), false);
});

test("shouldProcess: excluded titles rejected even when account is in scope", () => {
  assert.equal(shouldProcess({ zoomAccount: "Northeast", title: "NE PWA Projects" }), false);
  assert.equal(shouldProcess({ zoomAccount: "Northeast", title: "FGS Video Review" }), false);
});

test("parseExtractedItems: valid array parses + validates", () => {
  const out = parseExtractedItems(
    '[{"title":"Send proposal","description":"by Fri","suggestedAssignee":"Aira","suggestedDueDate":"2026-06-27","clientContext":"Oakwood"}]',
  );
  assert.equal(out?.length, 1);
  assert.equal(out?.[0].title, "Send proposal");
  assert.equal(out?.[0].suggestedDueDate, "2026-06-27");
});

test("parseExtractedItems: strips a ```json fence", () => {
  const out = parseExtractedItems('```json\n[{"title":"Do thing"}]\n```');
  assert.equal(out?.length, 1);
  assert.equal(out?.[0].title, "Do thing");
});

test("parseExtractedItems: empty array is valid (not null)", () => {
  assert.deepEqual(parseExtractedItems("[]"), []);
});

test("parseExtractedItems: malformed JSON → null (signals retry)", () => {
  assert.equal(parseExtractedItems("not json at all"), null);
  assert.equal(parseExtractedItems('[{"title": '), null);
});

test("parseExtractedItems: drops items without a title + bad dates", () => {
  const out = parseExtractedItems('[{"description":"no title"},{"title":"Keep","suggestedDueDate":"someday"}]');
  assert.equal(out?.length, 1);
  assert.equal(out?.[0].title, "Keep");
  assert.equal(out?.[0].suggestedDueDate, undefined); // "someday" rejected
});

test("buildExtractionMessages: includes header + transcript, truncates long bodies", () => {
  const meta = parseMeetingFile(SAMPLE);
  const msgs = buildExtractionMessages({ ...meta, body: "x".repeat(30000) }, 100);
  assert.equal(msgs[0].role, "system");
  assert.match(msgs[1].content, /MEETING: Aira & Oakwood Check-in/);
  assert.match(msgs[1].content, /truncated/);
});
