import test from "node:test";
import assert from "node:assert/strict";

import {
  sanitizeBlocks,
  parseStoredBlocks,
  updateBlockText,
  toggleTodo,
  olNumbers,
  parseSlashInput,
  MAX_BLOCKS,
  type Block,
} from "../src/lib/services/blocks";

// ── sanitizeBlocks ──────────────────────────────────────────────────────────

test("sanitizeBlocks: accepts well-formed blocks and preserves todo/chip extras", () => {
  const out = sanitizeBlocks([
    { id: "a", kind: "todo", text: "Do it", done: true },
    { id: "b", kind: "chip", text: "Task: ship", ref: { type: "task", id: "t1" } },
  ]);
  assert.equal(out[0].done, true);
  assert.deepEqual(out[1].ref, { type: "task", id: "t1" });
});

test("sanitizeBlocks: rejects non-arrays, unknown kinds, duplicate ids, too many blocks", () => {
  assert.throws(() => sanitizeBlocks("nope"), /must be an array/);
  assert.throws(() => sanitizeBlocks([{ id: "a", kind: "h9", text: "" }]), /unknown kind/);
  assert.throws(
    () => sanitizeBlocks([{ id: "a", kind: "p", text: "" }, { id: "a", kind: "p", text: "" }]),
    /Duplicate/,
  );
  const many = Array.from({ length: MAX_BLOCKS + 1 }, (_, i) => ({ id: `b${i}`, kind: "p", text: "" }));
  assert.throws(() => sanitizeBlocks(many), /Too many/);
});

test("sanitizeBlocks: drops invalid chip refs, defaults missing ids/text", () => {
  const out = sanitizeBlocks([
    { kind: "chip", text: "x", ref: { type: "bogus", id: "z" } },
    { kind: "p" },
  ]);
  assert.equal(out[0].ref, undefined);
  assert.equal(out[0].id, "b0");
  assert.equal(out[1].text, "");
});

test("parseStoredBlocks: bad stored JSON renders as an empty doc, never throws", () => {
  assert.deepEqual(parseStoredBlocks({ nope: 1 }), []);
  assert.deepEqual(parseStoredBlocks(null), []);
});

// ── editor ops ──────────────────────────────────────────────────────────────

const doc: Block[] = [
  { id: "1", kind: "h2", text: "Plan" },
  { id: "2", kind: "todo", text: "Audit", done: false },
];

test("updateBlockText: immutable single-block edit", () => {
  const next = updateBlockText(doc, "2", "Audit Notion");
  assert.equal(next[1].text, "Audit Notion");
  assert.equal(doc[1].text, "Audit"); // original untouched
});

test("toggleTodo: flips only todo blocks", () => {
  assert.equal(toggleTodo(doc, "2")[1].done, true);
  assert.equal(toggleTodo(doc, "1")[0].done, undefined);
});

test("olNumbers: numbers consecutive runs, restarts after a break", () => {
  const blocks: Block[] = [
    { id: "a", kind: "ol", text: "one" },
    { id: "b", kind: "ol", text: "two" },
    { id: "c", kind: "p", text: "break" },
    { id: "d", kind: "ol", text: "restart" },
  ];
  assert.deepEqual(olNumbers(blocks), { a: 1, b: 2, d: 1 });
});

// ── slash commands ──────────────────────────────────────────────────────────

test("parseSlashInput: non-slash input → null", () => {
  assert.equal(parseSlashInput("hello"), null);
});

test("parseSlashInput: filters commands and splits remainder text", () => {
  const res = parseSlashInput("/task Ship the importer");
  assert.ok(res);
  assert.equal(res.matches[0].command, "task");
  assert.equal(res.text, "Ship the importer");
});

test("parseSlashInput: bare slash lists everything", () => {
  const res = parseSlashInput("/");
  assert.ok(res && res.matches.length >= 6);
});
