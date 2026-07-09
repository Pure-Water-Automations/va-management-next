// src/lib/services/pay-schedule.ts
// Semi-monthly pay schedule (proposal §4):
//   Run A: covers the 1st → 15th, pay run ON the 15th.
//   Run B: covers the 16th → end of month, pay run 2 days BEFORE the last day.
// Paying in-arrears: hours logged after Run B's run date simply fall into the
// next period at calculation time — no estimates, no true-ups (review §14).
// All values are UTC date-only Dates, matching actions/payroll.ts dateOnly().

export type PayPeriod = {
  periodStart: Date;
  periodEnd: Date;
  runDate: Date; // == PayrollPeriod.closeDate
};

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));

function lastDayOfMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
}

/** The pay period containing the given UTC date. */
export function periodContaining(date: Date): PayPeriod {
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth();
  if (date.getUTCDate() <= 15) {
    return { periodStart: utc(y, m, 1), periodEnd: utc(y, m, 15), runDate: utc(y, m, 15) };
  }
  const eom = lastDayOfMonth(y, m);
  return { periodStart: utc(y, m, 16), periodEnd: utc(y, m, eom), runDate: utc(y, m, eom - 2) };
}

/** The period immediately after the given one (A→B within a month, B→next month's A). */
export function nextPeriodAfter(p: PayPeriod): PayPeriod {
  const dayAfterEnd = new Date(p.periodEnd.getTime() + 24 * 60 * 60 * 1000);
  return periodContaining(dayAfterEnd);
}
