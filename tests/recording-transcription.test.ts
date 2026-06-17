import test from "node:test";
import assert from "node:assert/strict";

import { parseTranscription } from "../src/lib/recordings/transcription";

test("parses clean JSON with title, summary, and segments", () => {
  const r = parseTranscription(
    JSON.stringify({
      title: "Invoice Reconciliation",
      summary: "Reconciles April invoices.",
      segments: [
        { start: 0, end: 3.5, text: "Hello team." },
        { start: 3.5, end: 7, text: "Reconciling invoices." },
      ],
    }),
  );
  assert.ok(r);
  assert.equal(r!.title, "Invoice Reconciliation");
  assert.equal(r!.summary, "Reconciles April invoices.");
  assert.equal(r!.segments.length, 2);
  assert.equal(r!.text, "Hello team. Reconciling invoices."); // derived from segments
});

test("strips ```json code fences", () => {
  const r = parseTranscription('```json\n{"segments":[{"start":0,"end":1,"text":"hi"}]}\n```');
  assert.ok(r);
  assert.equal(r!.text, "hi");
});

test("extracts the JSON object even with surrounding prose", () => {
  const r = parseTranscription('Sure! Here it is: {"title":"T","summary":"S","segments":[]}  — done');
  assert.ok(r);
  assert.equal(r!.title, "T");
  assert.equal(r!.summary, "S");
});

test("uses explicit text when provided over deriving from segments", () => {
  const r = parseTranscription(
    JSON.stringify({ text: "full verbatim text", segments: [{ start: 0, end: 1, text: "partial" }] }),
  );
  assert.ok(r);
  assert.equal(r!.text, "full verbatim text");
});

test("normalizes string numbers, drops empty-text segments, and sorts by start", () => {
  const r = parseTranscription(
    JSON.stringify({
      segments: [
        { start: "5", end: "6", text: "second" },
        { start: "1", end: "2", text: "first" },
        { start: "9", end: "10", text: "   " }, // dropped (empty)
      ],
    }),
  );
  assert.ok(r);
  assert.equal(r!.segments.length, 2);
  assert.deepEqual(
    r!.segments.map((s) => s.text),
    ["first", "second"],
  );
  assert.equal(r!.segments[0].start, 1);
});

test("clamps negative start and defaults missing end to start", () => {
  const r = parseTranscription(JSON.stringify({ segments: [{ start: -3, text: "x" }] }));
  assert.ok(r);
  assert.equal(r!.segments[0].start, 0);
  assert.equal(r!.segments[0].end, 0);
});

test("returns null for the 'no intelligible speech' empty case", () => {
  const r = parseTranscription(JSON.stringify({ title: null, summary: null, segments: [] }));
  assert.equal(r, null);
});

test("returns null for non-JSON / garbage", () => {
  assert.equal(parseTranscription("not json at all"), null);
  assert.equal(parseTranscription(""), null);
  assert.equal(parseTranscription("[1,2,3]"), null); // array, not the expected object
});

test("keeps a summary-only result (no segments, no text)", () => {
  const r = parseTranscription(JSON.stringify({ summary: "Just a summary.", segments: [] }));
  assert.ok(r);
  assert.equal(r!.summary, "Just a summary.");
  assert.equal(r!.text, "");
});
