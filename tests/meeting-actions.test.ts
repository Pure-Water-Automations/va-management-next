import test from "node:test";
import assert from "node:assert/strict";

import { allItemsResolved, matchAssignee } from "../src/lib/services/meeting-actions";

test("allItemsResolved: false when any item still PENDING", () => {
  assert.equal(allItemsResolved([{ status: "CONFIRMED" }, { status: "PENDING" }]), false);
});

test("allItemsResolved: true when all CONFIRMED/SKIPPED", () => {
  assert.equal(allItemsResolved([{ status: "CONFIRMED" }, { status: "SKIPPED" }]), true);
});

test("allItemsResolved: false for an empty list (nothing to resolve)", () => {
  assert.equal(allItemsResolved([]), false);
});

test("matchAssignee: exact + partial name match (case-insensitive)", () => {
  const users = [
    { id: "u1", name: "Aira Mangila" },
    { id: "u2", name: "Kanna Saito" },
  ];
  assert.equal(matchAssignee("Aira", users), "u1");
  assert.equal(matchAssignee("kanna saito", users), "u2");
  assert.equal(matchAssignee("Aira Mangila", users), "u1");
});

test("matchAssignee: no match → null", () => {
  assert.equal(matchAssignee("Zawadi", [{ id: "u1", name: "Aira" }]), null);
  assert.equal(matchAssignee("", [{ id: "u1", name: "Aira" }]), null);
  assert.equal(matchAssignee(null, [{ id: "u1", name: "Aira" }]), null);
});
