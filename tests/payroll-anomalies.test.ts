import test from "node:test";
import assert from "node:assert/strict";
import { detectAnomalies, type AnomalyInput } from "../src/lib/services/payroll-anomalies";

const base: AnomalyInput = {
  hoursInPeriod: 40,
  trailingPeriodHours: [38, 42, 40],
  targetHoursWeekly: 20,
  weeksInPeriod: 2.2,
  needsReviewDays: 0,
  newProjects: [],
  wasActiveLastPeriod: true,
  spikeMultiplier: 1.5,
};

test("normal hours produce no flags", () => {
  assert.deepEqual(detectAnomalies(base), []);
});

test("spike above 1.5x trailing average is flagged", () => {
  const r = detectAnomalies({ ...base, hoursInPeriod: 90 });
  assert.ok(r.some((x) => x.includes("1.5×")), JSON.stringify(r));
});

test("hours above target weekly x weeks is flagged", () => {
  const r = detectAnomalies({ ...base, hoursInPeriod: 50, trailingPeriodHours: [48, 50, 49] });
  assert.ok(r.some((x) => x.includes("target")), JSON.stringify(r));
});

test("zero hours for a previously active VA is flagged", () => {
  const r = detectAnomalies({ ...base, hoursInPeriod: 0 });
  assert.ok(r.some((x) => x.toLowerCase().includes("zero hours")), JSON.stringify(r));
});

test("needs-review tracker days and new projects are flagged", () => {
  const r = detectAnomalies({ ...base, needsReviewDays: 3, newProjects: ["Mystery Client"] });
  assert.equal(r.length, 2);
});

test("no trailing history means no spike flag (new VA grace)", () => {
  assert.deepEqual(detectAnomalies({ ...base, trailingPeriodHours: [], hoursInPeriod: 60, targetHoursWeekly: 40 }), []);
});
