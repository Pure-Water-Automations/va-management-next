import test from "node:test";
import assert from "node:assert/strict";

import { computeEligibility } from "../src/lib/services/tier-eligibility";

test("non-trainee role is eligible when on track and cumulative hours reach threshold", () => {
  assert.deepEqual(
    computeEligibility({
      currentRole: "TIER_1",
      cumulativeHours: 120,
      role: {
        minTotalHoursToReachNext: 120,
        nextRoleId: "TIER_2",
        onAdvancementTrack: true,
      },
    }),
    { eligible: true, nextRoleId: "TIER_2" },
  );
});

test("role is not eligible below the threshold", () => {
  assert.deepEqual(
    computeEligibility({
      currentRole: "TIER_1",
      cumulativeHours: 119.9,
      role: {
        minTotalHoursToReachNext: 120,
        nextRoleId: "TIER_2",
        onAdvancementTrack: true,
      },
    }),
    { eligible: false },
  );
});

test("role is not eligible when not on the advancement track", () => {
  assert.deepEqual(
    computeEligibility({
      currentRole: "TIER_4",
      cumulativeHours: 500,
      role: {
        minTotalHoursToReachNext: 400,
        nextRoleId: "TIER_5",
        onAdvancementTrack: false,
      },
    }),
    { eligible: false },
  );
});

test("trainee is never hours-trigger eligible because graduation is evaluation-gated", () => {
  assert.deepEqual(
    computeEligibility({
      currentRole: "TRAINEE",
      cumulativeHours: 999,
      role: {
        minTotalHoursToReachNext: 40,
        nextRoleId: "TIER_1",
        onAdvancementTrack: true,
      },
    }),
    { eligible: false },
  );
});
