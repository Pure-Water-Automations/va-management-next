import test from "node:test";
import assert from "node:assert/strict";

import {
  parseFieldType,
  parseOptions,
  nextOption,
  validateFieldValue,
} from "../src/lib/services/fields";

// ── parseFieldType ──────────────────────────────────────────────────────────

test("parseFieldType: accepts known types case-insensitively", () => {
  assert.equal(parseFieldType("select"), "SELECT");
  assert.equal(parseFieldType("Text"), "TEXT");
});

test("parseFieldType: rejects unknown types", () => {
  assert.throws(() => parseFieldType("NUMBER"), /Unknown field type/);
});

// ── parseOptions ────────────────────────────────────────────────────────────

test("parseOptions: comma string → trimmed list", () => {
  assert.deepEqual(parseOptions("Research, Build , Launch"), ["Research", "Build", "Launch"]);
});

test("parseOptions: array input, dedupes case-insensitively, drops empties", () => {
  assert.deepEqual(parseOptions(["Build", "build", "", "  ", "Launch"]), ["Build", "Launch"]);
});

test("parseOptions: null/undefined → empty", () => {
  assert.deepEqual(parseOptions(null), []);
  assert.deepEqual(parseOptions(undefined), []);
});

// ── nextOption (click-to-cycle) ─────────────────────────────────────────────

test("nextOption: cycles through options and wraps", () => {
  const opts = ["Research", "Build", "Launch"];
  assert.equal(nextOption(opts, null), "Research");
  assert.equal(nextOption(opts, "Research"), "Build");
  assert.equal(nextOption(opts, "Launch"), "Research");
});

test("nextOption: unknown current restarts at first; empty options → null", () => {
  assert.equal(nextOption(["A", "B"], "Z"), "A");
  assert.equal(nextOption([], "A"), null);
});

// ── validateFieldValue ──────────────────────────────────────────────────────

test("validateFieldValue: SELECT must match an option when options exist", () => {
  assert.equal(validateFieldValue("SELECT", ["Build"], "Build"), "Build");
  assert.throws(() => validateFieldValue("SELECT", ["Build"], "Ship"), /not one of/);
});

test("validateFieldValue: SELECT with no options accepts free text", () => {
  assert.equal(validateFieldValue("SELECT", [], "Anything"), "Anything");
});

test("validateFieldValue: DATE normalizes to YYYY-MM-DD and rejects junk", () => {
  assert.equal(validateFieldValue("DATE", [], "2026-08-15T10:00:00Z"), "2026-08-15");
  assert.throws(() => validateFieldValue("DATE", [], "next tuesday"), /not a date/);
});

test("validateFieldValue: TEXT/PERSON trim; empty throws (clear is handled upstream)", () => {
  assert.equal(validateFieldValue("TEXT", [], "  $2,400 "), "$2,400");
  assert.throws(() => validateFieldValue("PERSON", [], "   "), /empty/);
});
