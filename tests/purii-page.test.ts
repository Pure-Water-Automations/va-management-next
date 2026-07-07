import test from "node:test";
import assert from "node:assert/strict";

import { pageToPlainText, parseChecklist, scoreRelated } from "../src/lib/purii-page";
import type { Block } from "../src/lib/services/blocks";

const blocks: Block[] = [
  { id: "1", kind: "h2", text: "Client intake" },
  { id: "2", kind: "todo", text: "Send agreement", done: true },
  { id: "3", kind: "p", text: "Payroll close happens monthly." },
];

test("pageToPlainText: kinds get markers, output is capped", () => {
  const out = pageToPlainText("Onboarding", blocks);
  assert.match(out, /PAGE: Onboarding/);
  assert.match(out, /## Client intake/);
  assert.match(out, /\[x\] Send agreement/);
  assert.ok(pageToPlainText("t", blocks, 20).length <= 20);
});

test("parseChecklist: JSON array, fenced JSON, junk", () => {
  assert.deepEqual(parseChecklist('["A","B"]'), ["A", "B"]);
  assert.deepEqual(parseChecklist('```json\n["A"]\n```'), ["A"]);
  assert.equal(parseChecklist("no list here"), null);
  assert.equal(parseChecklist("[]"), null);
});

test("scoreRelated: title-term overlap outranks body-only overlap; zero-score drops", () => {
  const res = scoreRelated("Client intake process", blocks, [
    { id: "a", title: "Client intake SOP" },
    { id: "b", title: "Payroll close SOP" },
    { id: "c", title: "Totally unrelated doc" },
  ]);
  assert.equal(res[0].id, "a");
  assert.ok(res.some((r) => r.id === "b")); // matches body term "payroll"
  assert.ok(!res.some((r) => r.id === "c"));
});
