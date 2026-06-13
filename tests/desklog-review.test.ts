import test from "node:test";
import assert from "node:assert/strict";

import { computeReviewFlag } from "../src/lib/services/desklog-review";

test("flags task spent of at least 10 hours", () => {
  assert.deepEqual(
    computeReviewFlag({
      taskSpentHrs: 10,
      timeAtWorkHrs: 10,
      focusTimeHrs: 3,
      idleTimeHrs: 1,
      taskAssignedHrs: 10,
    }),
    { needsReview: true, reason: "task_spent_10h_or_more" },
  );
});

test("flags time at work of at least 16 hours", () => {
  assert.deepEqual(
    computeReviewFlag({
      taskSpentHrs: 4,
      timeAtWorkHrs: 16,
      focusTimeHrs: 3,
      idleTimeHrs: 1,
    }),
    { needsReview: true, reason: "time_at_work_16h_or_more" },
  );
});

test("flags focus time of at least 4 hours with zero task spent", () => {
  assert.deepEqual(
    computeReviewFlag({
      taskSpentHrs: 0,
      timeAtWorkHrs: 5,
      focusTimeHrs: 4,
      idleTimeHrs: 1,
    }),
    { needsReview: true, reason: "focus_time_without_task_spent" },
  );
});

test("flags task spent greater than assigned when assigned is positive", () => {
  assert.deepEqual(
    computeReviewFlag({
      taskSpentHrs: 3,
      timeAtWorkHrs: 3,
      focusTimeHrs: 2,
      idleTimeHrs: 0.5,
      taskAssignedHrs: 2.5,
    }),
    { needsReview: true, reason: "task_spent_exceeds_assigned" },
  );
});

test("flags idle time at least 50 percent of time at work when at work is at least 4 hours", () => {
  assert.deepEqual(
    computeReviewFlag({
      taskSpentHrs: 2,
      timeAtWorkHrs: 4,
      focusTimeHrs: 1,
      idleTimeHrs: 2,
    }),
    { needsReview: true, reason: "idle_time_at_least_50pct" },
  );
});

test("does not flag normal rows or task spent greater than zero assigned", () => {
  assert.deepEqual(
    computeReviewFlag({
      taskSpentHrs: 3,
      timeAtWorkHrs: 6,
      focusTimeHrs: 3,
      idleTimeHrs: 1,
      taskAssignedHrs: 0,
    }),
    { needsReview: false },
  );
});
