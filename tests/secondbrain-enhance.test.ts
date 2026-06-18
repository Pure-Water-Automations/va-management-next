import test from "node:test";
import assert from "node:assert/strict";

import { parseSynthesis, mergeContextIntoDescription, applyTaskAnchor, TASK_ANCHOR } from "../src/lib/secondbrain/enhance";

test("applyTaskAnchor suppresses tasks when no card is a strong anchor", () => {
  const s = { contextSummary: "weak context", tasks: [{ title: "Invented task", priority: "High" as const }] };
  // strong anchor present -> keep
  assert.deepEqual(applyTaskAnchor(s, 0.84), s);
  // only tangential/region cards (top ~0.71) -> drop tasks, keep summary
  assert.deepEqual(applyTaskAnchor(s, 0.71), { contextSummary: "weak context", tasks: [] });
});

test("TASK_ANCHOR sits in the gap between noise tops (~0.71) and real tops (~0.84)", () => {
  assert.ok(TASK_ANCHOR > 0.71 && TASK_ANCHOR < 0.84);
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
    { source: "notion", title: "Brief", snippet: "WP site", link: "https://n/x" },
  ]);
  assert.match(merged, /^Existing description\./);
  assert.match(merged, /## Context \(from Second Brain\)/);
  assert.match(merged, /Brief/);
  assert.match(merged, /https:\/\/n\/x/);
});

test("mergeContextIntoDescription adds a dated subsection when the heading already exists", () => {
  const first = mergeContextIntoDescription("Base.", [{ source: "drive", title: "A", snippet: "a" }]);
  const second = mergeContextIntoDescription(first, [{ source: "drive", title: "B", snippet: "b" }]);
  // Heading appears once; both items present.
  assert.equal(second.match(/## Context \(from Second Brain\)/g)?.length, 1);
  assert.match(second, /A/);
  assert.match(second, /B/);
  assert.match(second, /### Added /); // dated subsection for the second merge
});

test("mergeContextIntoDescription handles a null starting description", () => {
  const merged = mergeContextIntoDescription(null, [{ source: "drive", title: "A", snippet: "a" }]);
  assert.match(merged, /## Context \(from Second Brain\)/);
});
