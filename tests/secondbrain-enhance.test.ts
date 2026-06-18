import test from "node:test";
import assert from "node:assert/strict";

import { buildQueries, parseSynthesis, mergeContextIntoDescription } from "../src/lib/secondbrain/enhance";

test("buildQueries returns client + distinctive name words as short queries", () => {
  assert.deepEqual(
    buildQueries({ name: "NE Website Refresh", client: "Northeast", description: "Rebuild the site." }),
    ["Northeast", "website", "refresh"], // "ne" dropped (<3 chars), client first
  );
});

test("buildQueries strips bracketed tags and stopwords", () => {
  assert.deepEqual(
    buildQueries({ name: "[SAMPLE] Website Revamp", client: null, description: null }),
    ["website", "revamp"], // [SAMPLE] + stopwords gone
  );
});

test("buildQueries tolerates a name with only stopwords by returning the client", () => {
  assert.deepEqual(buildQueries({ name: "New Project", client: "Acme", description: null }), ["Acme"]);
});

test("buildQueries de-dupes and caps at 4 queries", () => {
  const out = buildQueries({
    name: "Alpha Bravo Charlie Delta Echo",
    client: "Alpha",
    description: null,
  });
  assert.ok(out.length <= 4);
  assert.equal(new Set(out.map((q) => q.toLowerCase())).size, out.length); // unique
});

test("parseSynthesis accepts valid JSON and coerces tasks", () => {
  const out = parseSynthesis(
    JSON.stringify({
      contextSummary: "Site needs a refresh.",
      tasks: [
        { title: "Audit site", instructions: "Review pages", priority: "High" },
        { title: "Draft copy" },
      ],
    }),
  );
  assert.equal(out.contextSummary, "Site needs a refresh.");
  assert.equal(out.tasks.length, 2);
  assert.equal(out.tasks[0].priority, "High");
  assert.equal(out.tasks[1].priority, "Medium"); // default
  assert.equal(out.tasks[1].instructions, undefined);
});

test("parseSynthesis returns empty tasks on junk", () => {
  assert.deepEqual(parseSynthesis("not json at all"), { contextSummary: "", tasks: [] });
  assert.deepEqual(parseSynthesis(JSON.stringify({ nope: 1 })), { contextSummary: "", tasks: [] });
});

test("parseSynthesis strips a markdown code fence", () => {
  const out = parseSynthesis('```json\n{"contextSummary":"x","tasks":[]}\n```');
  assert.equal(out.contextSummary, "x");
});

test("mergeContextIntoDescription appends a heading block, preserving the original", () => {
  const merged = mergeContextIntoDescription("Existing description.", [
    { source: "search_notion_mirror", title: "Brief", snippet: "WP site", link: "https://n/x" },
  ]);
  assert.match(merged, /^Existing description\./);
  assert.match(merged, /## Context \(from Second Brain\)/);
  assert.match(merged, /Brief/);
  assert.match(merged, /https:\/\/n\/x/);
});

test("mergeContextIntoDescription adds a dated subsection when the heading already exists", () => {
  const first = mergeContextIntoDescription("Base.", [{ source: "s", title: "A", snippet: "a" }]);
  const second = mergeContextIntoDescription(first, [{ source: "s", title: "B", snippet: "b" }]);
  // Heading appears once; both items present.
  assert.equal(second.match(/## Context \(from Second Brain\)/g)?.length, 1);
  assert.match(second, /A/);
  assert.match(second, /B/);
  assert.match(second, /### Added /); // dated subsection for the second merge
});

test("mergeContextIntoDescription handles a null starting description", () => {
  const merged = mergeContextIntoDescription(null, [{ source: "s", title: "A", snippet: "a" }]);
  assert.match(merged, /## Context \(from Second Brain\)/);
});
