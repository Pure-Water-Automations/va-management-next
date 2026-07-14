import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStatusMapForKind,
  unmappedStatuses,
  vaStatusToNotionOption,
  notionOptionToVaStatus,
  ensureNotionLink,
  reconcilePoll,
  type StatusMap,
} from "../src/lib/notion-sync";

test("buildStatusMapForKind matches common Notion task option names (exact)", () => {
  const m = buildStatusMapForKind("task", ["Not started", "In progress", "Done"]);
  assert.equal(m.NotStarted, "Not started");
  assert.equal(m.InProgress, "In progress");
  assert.equal(m.Done, "Done");
  // No "Blocked"-like option present -> left unmapped (safe no-op), not guessed.
  assert.equal(m.Blocked, undefined);
  assert.deepEqual(unmappedStatuses("task", m), ["Blocked"]);
});

test("buildStatusMapForKind handles synonyms + substring (To Do / Doing / Complete)", () => {
  const m = buildStatusMapForKind("task", ["To Do", "Doing", "Complete", "On Hold"]);
  assert.equal(m.NotStarted, "To Do");
  assert.equal(m.InProgress, "Doing");
  assert.equal(m.Done, "Complete");
  assert.equal(m.Blocked, "On Hold");
  assert.deepEqual(unmappedStatuses("task", m), []);
});

test("buildStatusMapForKind for projects + substring match on decorated names", () => {
  const m = buildStatusMapForKind("project", ["Planning", "In Progress (dev)", "Shipped", "Paused"]);
  assert.equal(m.Planning, "Planning");
  assert.equal(m.Active, "In Progress (dev)"); // substring
  assert.equal(m.Done, "Shipped");
  assert.equal(m.Paused, "Paused");
});

test("each Notion option is used at most once", () => {
  // "Done" could match both candidates list-wise, but one option can't serve two statuses.
  const m = buildStatusMapForKind("task", ["Active", "Done"]);
  const used = Object.values(m);
  assert.equal(new Set(used).size, used.length);
});

const MAP: StatusMap = {
  task: { NotStarted: "Not started", InProgress: "In progress", Done: "Done", Blocked: "Blocked" },
  project: { Planning: "Planning", Active: "Active", Done: "Done", Paused: "Paused" },
};

test("vaStatusToNotionOption / notionOptionToVaStatus round-trip (case-insensitive)", () => {
  assert.equal(vaStatusToNotionOption("task", "InProgress", MAP), "In progress");
  assert.equal(notionOptionToVaStatus("task", "in progress", MAP), "InProgress"); // case-insensitive
  assert.equal(notionOptionToVaStatus("task", "Nonexistent", MAP), null);
  assert.equal(vaStatusToNotionOption("task", "InProgress", null), null);
});

test("ensureNotionLink appends once and is idempotent", () => {
  const url = "https://www.notion.so/abc123";
  const once = ensureNotionLink("Do the thing.", url);
  assert.ok(once.includes(url));
  assert.ok(once.includes("Do the thing."));
  const twice = ensureNotionLink(once, url);
  assert.equal(twice, once); // no duplicate link
  assert.equal(ensureNotionLink("", url), `🔗 Notion: ${url}`);
  assert.equal(ensureNotionLink(null, url), `🔗 Notion: ${url}`);
});

test("reconcilePoll: Notion changed since last sync -> apply to console", () => {
  const r = reconcilePoll({
    kind: "task",
    vaStatus: "NotStarted",
    notionOption: "In progress",
    lastNotionStatus: "Not started",
    statusMap: MAP,
  });
  assert.deepEqual(r, { action: "applyToVa", vaStatus: "InProgress", notionOption: "In progress" });
});

test("reconcilePoll: nothing changed -> none", () => {
  const r = reconcilePoll({
    kind: "task",
    vaStatus: "InProgress",
    notionOption: "In progress",
    lastNotionStatus: "In progress",
    statusMap: MAP,
  });
  assert.deepEqual(r, { action: "none" });
});

test("reconcilePoll: console moved while Notion unchanged -> push to Notion", () => {
  const r = reconcilePoll({
    kind: "task",
    vaStatus: "Done",
    notionOption: "In progress",
    lastNotionStatus: "In progress", // Notion hasn't moved since last sync
    statusMap: MAP,
  });
  assert.deepEqual(r, { action: "pushToNotion", notionOption: "Done" });
});

test("reconcilePoll: Notion option that maps to nothing -> none (no spurious write)", () => {
  const r = reconcilePoll({
    kind: "task",
    vaStatus: "NotStarted",
    notionOption: "Archived", // unmapped
    lastNotionStatus: "Not started",
    statusMap: MAP,
  });
  assert.deepEqual(r, { action: "none" });
});

test("reconcilePoll: Notion change that resolves to the SAME console status -> none", () => {
  const r = reconcilePoll({
    kind: "task",
    vaStatus: "InProgress",
    notionOption: "In progress",
    lastNotionStatus: "Doing", // option text changed but maps to same console status
    statusMap: MAP,
  });
  assert.deepEqual(r, { action: "none" });
});
