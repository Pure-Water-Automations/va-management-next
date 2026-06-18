import test from "node:test";
import assert from "node:assert/strict";

import {
  parseSemanticResults,
  parseDriveResults,
  dedupeResults,
  distinctiveProjectTokens,
} from "../src/lib/secondbrain/client";

// --- real notion semantic format (captured from the live server) ---
const NOTION_TEXT = `===== HYBRID NOTION RESULTS FOR: "x" =====

--- Result 1 (Hybrid Score: 0.6525 | Semantic Distance: 0.3350) ---
Title: Registration form Requirements for Northeast Regional Leadership Assembly | DB: Tasks Tracker
URL: https://www.notion.so/Registration-form-366063b66bf1801a989ddaa46d59d61d
Excerpt:
Properties:
- Title: Registration form Requirements for Northeast Regional Leadership Assembly
- Status: Done
- Description: Making a Registration form for Northeast Regional Leadership Assembly | May 29-31, 2026

# Registration form Requirements
==================================================

--- Result 2 (Hybrid Score: 0.0164 | Semantic Distance: 0.4140) ---
Title: ChatGPT Codex Just Got Terrifyingly Powerful | DB: AI Video Update Tracker
URL: https://www.notion.so/ChatGPT-Codex-35c063b66bf18134b3bade312070a608
Excerpt:
Properties:
- Title: ChatGPT Codex Just Got Terrifyingly Powerful
- Creator: Nick Ponte
`;

const MEETING_TEXT = `===== RESULTS FOR: "x" =====

--- Result 1 (Distance: 0.3126) ---
Source: Northeast Pastors Meeting (2026-04-08T23:56:42Z)
Path: /Users/justinokamoto/Documents/SecondBrain/Meetings/2026-04-08_Northeast_Northeast-Pastors-Meeting.md
Excerpt:
**[21:58] shota Iwasaki:** "subregional one is to allow more Category, expanding more category to more events."

--- Result 2 (Distance: 0.6300) ---
Source: Totally Unrelated Standup (2026-01-01T00:00:00Z)
Path: /Users/x/Meetings/unrelated.md
Excerpt:
nothing to do with the project
`;

test("parseSemanticResults notion: keeps the strong match, drops the low-score one, uses Description as snippet", () => {
  const out = parseSemanticResults(NOTION_TEXT, "notion");
  assert.equal(out.length, 1); // 0.0164 result dropped by the relevance gate
  assert.equal(out[0].source, "notion");
  assert.equal(out[0].title, "Registration form Requirements for Northeast Regional Leadership Assembly");
  assert.equal(out[0].link, "https://www.notion.so/Registration-form-366063b66bf1801a989ddaa46d59d61d");
  assert.match(out[0].snippet, /Making a Registration form/); // preferred the Description property
  assert.ok((out[0].score ?? 0) > 0.6);
});

test("parseSemanticResults meeting: keeps near distance, drops far distance; title strips the timestamp", () => {
  const out = parseSemanticResults(MEETING_TEXT, "meeting");
  assert.equal(out.length, 1); // distance 0.63 dropped
  assert.equal(out[0].title, "Northeast Pastors Meeting");
  assert.equal(out[0].link, undefined); // meetings expose a local Path, not a URL
  assert.match(out[0].snippet, /subregional/);
});

test("parseSemanticResults: no result blocks -> []", () => {
  assert.deepEqual(parseSemanticResults("No results.", "notion"), []);
  assert.deepEqual(parseSemanticResults("", "meeting"), []);
});

// --- real drive index grep format (two row shapes) ---
const DRIVE_TEXT = [
  "/app/.../drive_global_index.md:756:| `1ggKcWUBR-R4` | PWAINV1670173 - HSA-UWC Northeast - June 1-30 2026.pdf | 2026-05-30 15:32 | Aira Mangila | [open](https://drive.google.com/file/d/1ggKcWUBR-R4/view?usp=drivesdk) |",
  "/app/.../pinned/pure-water/_index.md:204:| `154l3rOX0` | PDF | /PWA- CLIENT INVOICE/NE- REGION | PWAINV1670171 - HSA-UWC Northeast - May 1-30 2026.pdf | 2026-05-01 18:43 | [open](https://drive.google.com/file/d/154l3rOX0/view?usp=drivesdk) |  |",
  "/app/.../drive_global_index.md:99:| `zzz` | unsubscribed.csv | 2026-01-01 | x | [open](https://drive.google.com/file/d/zzz/view) |",
].join("\n");

test("parseDriveResults extracts filename + Drive URL and drops the junk csv", () => {
  const out = parseDriveResults(DRIVE_TEXT);
  assert.equal(out.length, 2); // unsubscribed.csv filtered out
  assert.equal(out[0].source, "drive");
  assert.equal(out[0].title, "PWAINV1670173 - HSA-UWC Northeast - June 1-30 2026.pdf");
  assert.equal(out[0].link, "https://drive.google.com/file/d/1ggKcWUBR-R4/view?usp=drivesdk");
  assert.equal(out[1].title, "PWAINV1670171 - HSA-UWC Northeast - May 1-30 2026.pdf");
  assert.match(out[1].snippet, /NE- REGION/); // folder context becomes the snippet
  assert.doesNotMatch(out[0].snippet, /drive_global_index|\.md:\d+/); // grep path prefix stripped
  assert.doesNotMatch(out[1].snippet, /_index|\.md:\d+/);
});

test('parseDriveResults: "No matches found." -> []', () => {
  assert.deepEqual(parseDriveResults("No matches found."), []);
});

test("dedupeResults removes same source+title, sorts by score desc, caps", () => {
  const cards = [
    { source: "notion" as const, title: "Low", snippet: "", score: 0.31 },
    { source: "notion" as const, title: "High", snippet: "", score: 0.9 },
    { source: "notion" as const, title: "High", snippet: "dupe", score: 0.9 },
    { source: "drive" as const, title: "Doc", snippet: "", score: 0.42 }, // drive is scored in searchSecondBrain
  ];
  const out = dedupeResults(cards, 2);
  assert.equal(out.length, 2);
  assert.deepEqual(out.map((c) => c.title), ["High", "Doc"]); // 0.9, 0.42, then Low 0.31 cut
});

test("distinctiveProjectTokens keeps project-specific words, drops client words + stopwords", () => {
  assert.deepEqual(distinctiveProjectTokens({ name: "Northeast Assembly", client: "HSA-UWC Northeast" }), ["assembly"]);
  assert.deepEqual(distinctiveProjectTokens({ name: "[SAMPLE] Website Revamp", client: "Pure Water" }), ["website", "revamp"]);
  assert.deepEqual(distinctiveProjectTokens({ name: "Manhattan Project", client: "Northeast" }), ["manhattan"]);
});
