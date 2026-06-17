import test from "node:test";
import assert from "node:assert/strict";

import { normalizeToolResult } from "../src/lib/secondbrain/client";

test("normalizes a JSON-array text block into SbResult[]", () => {
  const result = {
    content: [
      {
        type: "text",
        text: JSON.stringify([
          { title: "NE Website Brief", snippet: "WP site, brand refresh needed", link: "https://notion.so/x" },
          { title: "Strategy Call", snippet: "new hero section" },
        ]),
      },
    ],
  };
  assert.deepEqual(normalizeToolResult("search_notion_mirror", result), [
    { source: "search_notion_mirror", title: "NE Website Brief", snippet: "WP site, brand refresh needed", link: "https://notion.so/x" },
    { source: "search_notion_mirror", title: "Strategy Call", snippet: "new hero section", link: undefined },
  ]);
});

test("falls back to a single card when text is plain prose, not JSON", () => {
  const result = { content: [{ type: "text", text: "Found 2 docs about the website." }] };
  const out = normalizeToolResult("search_drive_index", result);
  assert.equal(out.length, 1);
  assert.equal(out[0].source, "search_drive_index");
  assert.equal(out[0].snippet, "Found 2 docs about the website.");
});

test("returns [] for an error result", () => {
  assert.deepEqual(normalizeToolResult("search_meetings", { isError: true, content: [{ type: "text", text: "boom" }] }), []);
});

test("returns [] for empty/missing content", () => {
  assert.deepEqual(normalizeToolResult("search_meetings", {}), []);
  assert.deepEqual(normalizeToolResult("search_meetings", { content: [] }), []);
});
