import test from "node:test";
import assert from "node:assert/strict";

import {
  computeFlags,
  computeUtilization,
  detectTransition,
} from "../src/lib/services/capacity";

test("computeUtilization returns expected 14-day hours and utilization percentage", () => {
  assert.deepEqual(computeUtilization(20, 30), {
    expected14d: 40,
    utilizationPct: 75,
  });
});

test("computeFlags marks overburdened above 120 percent utilization", () => {
  assert.deepEqual(computeFlags(20, 50), {
    overburdened: true,
    underutilized: false,
  });
});

test("computeFlags marks overburdened above 60 hours even below 120 percent utilization", () => {
  assert.deepEqual(computeFlags(40, 61), {
    overburdened: true,
    underutilized: false,
  });
});

test("computeFlags marks underutilized below 50 percent utilization", () => {
  assert.deepEqual(computeFlags(20, 19), {
    overburdened: false,
    underutilized: true,
  });
});

test("detectTransition reports flagged, cleared, and stable states", () => {
  assert.deepEqual(
    detectTransition("green", { overburdened: true, underutilized: false }),
    { transition: "flagged", severity: "red" },
  );
  assert.deepEqual(
    detectTransition("yellow", { overburdened: false, underutilized: false }),
    { transition: "cleared", severity: "green" },
  );
  assert.deepEqual(
    detectTransition("red", { overburdened: true, underutilized: false }),
    { transition: "none", severity: "red" },
  );
});
