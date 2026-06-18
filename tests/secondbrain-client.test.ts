import test from "node:test";
import assert from "node:assert/strict";

import { normalizeToolResult } from "../src/lib/secondbrain/client";

test("parses grep-style path:line:content into one card per file", () => {
  const text = [
    "/app/notion_raw/role-descriptions--459ba69607fe/hr-assistant--189a4b68aca5.md:43:- Direct manager: Aira",
    "/app/notion_raw/role-descriptions--459ba69607fe/hr-assistant--189a4b68aca5.md:144:## What must be escalated to Aira",
    "/app/notion_raw/pipeline-tracking--dece1793b3c8/hoon-moon-choi--e9b664472580.md:119:> Aira",
  ].join("\n");
  const out = normalizeToolResult("search_notion_mirror", { content: [{ type: "text", text }] });
  assert.equal(out.length, 2); // two distinct files
  assert.equal(out[0].source, "search_notion_mirror");
  assert.equal(out[0].title, "hr-assistant"); // basename, id-suffix + .md stripped
  assert.match(out[0].snippet, /Direct manager: Aira/);
  assert.match(out[0].snippet, /escalated to Aira/); // multiple matched lines joined
});

test("extracts an http link from the matched content when present", () => {
  const text =
    "/app/drive_global_index.md:523:| VA Payroll 2026 | [open](https://docs.google.com/spreadsheets/d/abc/edit) |";
  const out = normalizeToolResult("search_drive_index", { content: [{ type: "text", text }] });
  assert.equal(out.length, 1);
  assert.equal(out[0].link, "https://docs.google.com/spreadsheets/d/abc/edit");
});

test("caps the number of file cards per tool", () => {
  const lines = Array.from({ length: 50 }, (_, i) => `/app/x/file${i}.md:1:match ${i}`);
  const out = normalizeToolResult("search_meetings", { content: [{ type: "text", text: lines.join("\n") }] });
  assert.ok(out.length <= 6, `expected <=6 cards, got ${out.length}`);
});

test('treats "No matches found." as zero results', () => {
  assert.deepEqual(normalizeToolResult("search_meetings", { content: [{ type: "text", text: "No matches found." }] }), []);
});

test("still accepts a JSON-array text block (structured tools)", () => {
  const result = {
    content: [
      {
        type: "text",
        text: JSON.stringify([{ title: "NE Website Brief", snippet: "brand refresh", link: "https://notion.so/x" }]),
      },
    ],
  };
  assert.deepEqual(normalizeToolResult("search_notion_mirror", result), [
    { source: "search_notion_mirror", title: "NE Website Brief", snippet: "brand refresh", link: "https://notion.so/x" },
  ]);
});

test("returns [] for an error result", () => {
  assert.deepEqual(normalizeToolResult("search_meetings", { isError: true, content: [{ type: "text", text: "boom" }] }), []);
});

test("returns [] for empty/missing/unparseable content", () => {
  assert.deepEqual(normalizeToolResult("search_meetings", {}), []);
  assert.deepEqual(normalizeToolResult("search_meetings", { content: [] }), []);
  // prose with no grep lines and no JSON -> no junk card
  assert.deepEqual(normalizeToolResult("search_meetings", { content: [{ type: "text", text: "Just some prose." }] }), []);
});
