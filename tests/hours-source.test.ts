import test from "node:test";
import assert from "node:assert/strict";
import { totalsFromBreakdown, type HoursBreakdownRow } from "../src/lib/services/hours-source";

test("totalsFromBreakdown sums per-VA hours from breakdown rows", () => {
  const rows: HoursBreakdownRow[] = [
    { vaId: "v1", date: new Date("2026-07-02"), project: "Client A — Admin", task: "Email", hours: 3, needsReview: false },
    { vaId: "v1", date: new Date("2026-07-03"), project: "Internal", task: "Training", hours: 2, needsReview: true },
    { vaId: "v2", date: new Date("2026-07-02"), project: null, task: null, hours: 4.5, needsReview: false },
  ];
  assert.deepEqual(totalsFromBreakdown(rows), { v1: 5, v2: 4.5 });
});

test("totalsFromBreakdown handles empty input", () => {
  assert.deepEqual(totalsFromBreakdown([]), {});
});
