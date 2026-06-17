import test from "node:test";
import assert from "node:assert/strict";

import {
  sortTasksByUrgency,
  computeProjectProgress,
  canUserActOnTask,
  inheritTaskClient,
} from "../src/lib/services/tasks";

// ── sortTasksByUrgency ──────────────────────────────────────────────────────

const now = new Date("2025-01-15T12:00:00Z");

test("sortTasksByUrgency: overdue tasks come first", () => {
  const overdue = { id: "a", dueDate: new Date("2025-01-14T00:00:00Z"), status: "InProgress" as const };
  const later = { id: "b", dueDate: new Date("2025-02-01T00:00:00Z"), status: "NotStarted" as const };
  const result = sortTasksByUrgency([later, overdue], now);
  assert.equal(result[0].id, "a");
});

test("sortTasksByUrgency: due this week comes before later", () => {
  const thisWeek = { id: "a", dueDate: new Date("2025-01-17T00:00:00Z"), status: "InProgress" as const };
  const later = { id: "b", dueDate: new Date("2025-02-01T00:00:00Z"), status: "NotStarted" as const };
  const result = sortTasksByUrgency([later, thisWeek], now);
  assert.equal(result[0].id, "a");
});

test("sortTasksByUrgency: null dueDate sorts last", () => {
  const noDue = { id: "a", dueDate: null, status: "NotStarted" as const };
  const later = { id: "b", dueDate: new Date("2025-02-01T00:00:00Z"), status: "InProgress" as const };
  const result = sortTasksByUrgency([noDue, later], now);
  assert.equal(result[0].id, "b");
});

test("sortTasksByUrgency: done tasks always sort after not-done with same bucket", () => {
  const done = { id: "a", dueDate: new Date("2025-01-14T00:00:00Z"), status: "Done" as const };
  const active = { id: "b", dueDate: new Date("2025-01-14T00:00:00Z"), status: "InProgress" as const };
  const result = sortTasksByUrgency([done, active], now);
  assert.equal(result[0].id, "b");
});

// ── computeProjectProgress ─────────────────────────────────────────────────

test("computeProjectProgress: returns 0 for empty list", () => {
  assert.equal(computeProjectProgress([]), 0);
});

test("computeProjectProgress: all done = 100", () => {
  const tasks = [{ status: "Done" as const }, { status: "Done" as const }];
  assert.equal(computeProjectProgress(tasks), 100);
});

test("computeProjectProgress: half done = 50", () => {
  const tasks = [{ status: "Done" as const }, { status: "NotStarted" as const }];
  assert.equal(computeProjectProgress(tasks), 50);
});

test("computeProjectProgress: rounds to nearest integer", () => {
  const tasks = [
    { status: "Done" as const },
    { status: "NotStarted" as const },
    { status: "NotStarted" as const },
  ];
  assert.equal(computeProjectProgress(tasks), 33);
});

// ── canUserActOnTask ───────────────────────────────────────────────────────

test("canUserActOnTask: HR_MANAGER can act on any task", () => {
  assert.equal(canUserActOnTask("user1", "HR_MANAGER", { assignedToId: "other", assignedById: "other2" }), true);
});

test("canUserActOnTask: VA can act on their own assigned task", () => {
  assert.equal(canUserActOnTask("user1", "VA", { assignedToId: "user1", assignedById: "other" }), true);
});

test("canUserActOnTask: VA cannot act on someone else's task", () => {
  assert.equal(canUserActOnTask("user1", "VA", { assignedToId: "other", assignedById: "also-other" }), false);
});

// ── inheritTaskClient ──────────────────────────────────────────────────────

test("inheritTaskClient: uses task client when set", () => {
  assert.equal(inheritTaskClient("ClientA", "ClientB"), "ClientA");
});

test("inheritTaskClient: falls back to project client when task client is null", () => {
  assert.equal(inheritTaskClient(null, "ClientB"), "ClientB");
});

test("inheritTaskClient: returns null when both are null", () => {
  assert.equal(inheritTaskClient(null, null), null);
});
