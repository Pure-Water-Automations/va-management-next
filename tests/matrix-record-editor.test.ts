import { test } from "node:test";
import assert from "node:assert/strict";
import { validateEdit } from "../src/lib/matrix/record-editor";

test("rejects non-allowlisted models (User/auth)", () => {
  const r = validateEdit("User", { id: "x" }, { isAdmin: true });
  assert.equal(r.ok, false);
});
test("rejects a non-unique where (no bulk)", () => {
  const r = validateEdit("Va", { name: "Aira" }, { targetHoursWeekly: 20 }); // name is not unique
  assert.equal(r.ok, false);
});
test("accepts a single-row scalar update on an allowed model", () => {
  const r = validateEdit("Va", { vaId: "aira_m" }, { targetHoursWeekly: 25 });
  assert.equal(r.ok, true);
});
test("accepts an enum field (compensationRole)", () => {
  const r = validateEdit("Va", { vaId: "aira_m" }, { compensationRole: "TIER_2" });
  assert.equal(r.ok, true);
});
test("rejects editing id or unknown/relation fields", () => {
  assert.equal(validateEdit("Va", { vaId: "x" }, { vaId: "y" }).ok, false);
  assert.equal(validateEdit("Va", { vaId: "x" }, { sessions: [] }).ok, false);
});
test("rejects empty data", () => {
  assert.equal(validateEdit("Setting", { key: "x" }, {}).ok, false);
});
