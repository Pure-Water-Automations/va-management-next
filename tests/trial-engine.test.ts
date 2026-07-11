import assert from "node:assert/strict";
import test from "node:test";
import type { MissionStatus } from "@prisma/client";
import {
  calculateTimerDelta,
  canTransitionMission,
  currentTrialDay,
  stripHiddenTargets,
} from "../src/lib/trial/engine";

test("mission state machine permits only Appendix B transitions", () => {
  const statuses: MissionStatus[] = [
    "NOT_STARTED",
    "IN_PROGRESS",
    "SUBMITTED",
    "NEEDS_REVISION",
    "APPROVED",
  ];
  const legal = new Set([
    "NOT_STARTED:IN_PROGRESS",
    "IN_PROGRESS:SUBMITTED",
    "SUBMITTED:APPROVED",
    "SUBMITTED:NEEDS_REVISION",
    "NEEDS_REVISION:IN_PROGRESS",
  ]);
  for (const from of statuses) {
    for (const to of statuses) {
      assert.equal(canTransitionMission(from, to), legal.has(`${from}:${to}`), `${from} -> ${to}`);
    }
  }
});

test("server timer delta ignores negative time and caps one interval at six hours", () => {
  const start = new Date("2026-07-11T10:00:00.000Z");
  assert.equal(calculateTimerDelta(start, new Date("2026-07-11T10:01:40.900Z")), 100);
  assert.equal(calculateTimerDelta(start, new Date("2026-07-11T09:00:00.000Z")), 0);
  assert.equal(calculateTimerDelta(start, new Date("2026-07-12T10:00:00.000Z")), 21_600);
});

test("current day is based on candidate-local calendar boundaries", () => {
  const start = new Date("2026-07-11T15:30:00.000Z"); // 23:30 on Jul 11 at GMT+8
  assert.equal(currentTrialDay(start, "GMT+8 — Manila", new Date("2026-07-11T15:59:59.000Z")), 1);
  assert.equal(currentTrialDay(start, "GMT+8 — Manila", new Date("2026-07-11T16:00:00.000Z")), 2);
  assert.equal(currentTrialDay(start, "GMT+8 — Manila", new Date("2026-07-13T16:00:00.000Z")), 4);
});

test("hidden evaluation targets are stripped recursively without mutating content", () => {
  const content = {
    clientBrief: "Visible",
    hiddenTargets: ["secret"],
    nested: { visible: true, hiddenTargets: ["also secret"] },
  };
  assert.deepEqual(stripHiddenTargets(content), {
    clientBrief: "Visible",
    nested: { visible: true },
  });
  assert.deepEqual(content.hiddenTargets, ["secret"]);
});
