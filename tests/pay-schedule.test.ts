// tests/pay-schedule.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { periodContaining, nextPeriodAfter, type PayPeriod } from "../src/lib/services/pay-schedule";

const d = (y: number, m: number, day: number) => new Date(Date.UTC(y, m - 1, day));
const key = (x: Date) => x.toISOString().slice(0, 10);
const asKeys = (p: PayPeriod) => ({ start: key(p.periodStart), end: key(p.periodEnd), run: key(p.runDate) });

test("Run A: 1st–15th, pay run on the 15th", () => {
  assert.deepEqual(asKeys(periodContaining(d(2026, 7, 1))), { start: "2026-07-01", end: "2026-07-15", run: "2026-07-15" });
  assert.deepEqual(asKeys(periodContaining(d(2026, 7, 15))), { start: "2026-07-01", end: "2026-07-15", run: "2026-07-15" });
});

test("Run B: 16th–EOM, pay run 2 days before month end", () => {
  // July has 31 days → run Jul 29
  assert.deepEqual(asKeys(periodContaining(d(2026, 7, 16))), { start: "2026-07-16", end: "2026-07-31", run: "2026-07-29" });
  assert.deepEqual(asKeys(periodContaining(d(2026, 7, 31))), { start: "2026-07-16", end: "2026-07-31", run: "2026-07-29" });
});

test("Run B: February (non-leap and leap)", () => {
  assert.deepEqual(asKeys(periodContaining(d(2026, 2, 20))), { start: "2026-02-16", end: "2026-02-28", run: "2026-02-26" });
  assert.deepEqual(asKeys(periodContaining(d(2028, 2, 20))), { start: "2028-02-16", end: "2028-02-29", run: "2028-02-27" });
});

test("nextPeriodAfter chains A→B→A across the month boundary", () => {
  const a = periodContaining(d(2026, 7, 3));
  const b = nextPeriodAfter(a);
  assert.deepEqual(asKeys(b), { start: "2026-07-16", end: "2026-07-31", run: "2026-07-29" });
  const c = nextPeriodAfter(b);
  assert.deepEqual(asKeys(c), { start: "2026-08-01", end: "2026-08-15", run: "2026-08-15" });
});

test("periods tile the calendar with no gaps or overlaps for a full year", () => {
  let p = periodContaining(d(2026, 1, 1));
  for (let i = 0; i < 24; i++) {
    const n = nextPeriodAfter(p);
    // next period starts exactly one day after the previous ends
    assert.equal(n.periodStart.getTime(), p.periodEnd.getTime() + 24 * 60 * 60 * 1000, `gap after ${key(p.periodEnd)}`);
    // run date is always within the period (in-arrears for Run B: hours after run roll forward)
    assert.ok(n.runDate >= n.periodStart && n.runDate <= n.periodEnd);
    p = n;
  }
});
