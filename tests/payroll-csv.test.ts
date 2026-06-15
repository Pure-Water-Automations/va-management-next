import test from "node:test";
import assert from "node:assert/strict";

import { buildPayrollCsv, payrollCsvFilename } from "../src/lib/services/payroll-csv";

const rows = [
  { vaId: "VA001", name: "Aira, Jr.", compensationRole: "TIER_2", compensationType: "hourly", hoursInPeriod: 40, hourlyRate: 6, salaryPerPeriod: null, grossPay: 240 },
  { vaId: "VA002", name: "Ben", compensationRole: "TIER_3", compensationType: "salary", hoursInPeriod: 80, hourlyRate: null, salaryPerPeriod: 500, grossPay: 500 },
];

test("buildPayrollCsv emits header, rows, and a TOTAL line", () => {
  const csv = buildPayrollCsv(rows, { periodStart: "2026-06-01", periodEnd: "2026-06-15" });
  const lines = csv.trim().split("\r\n");
  assert.equal(lines.length, 4); // header + 2 rows + total
  assert.match(lines[0], /^VA ID,Name,Role,Type,Hours,Rate,Gross Pay,Period Start,Period End$/);
  // a name with a comma is quoted
  assert.match(lines[1], /"Aira, Jr\."/);
  assert.match(lines[1], /VA001/);
  assert.match(lines[1], /240\.00/);
  // salary row uses salaryPerPeriod as the rate
  assert.match(lines[2], /500\.00,500\.00/);
  // total line
  assert.match(lines[3], /^TOTAL,/);
  assert.match(lines[3], /120\.00/); // total hours
  assert.match(lines[3], /740\.00/); // total gross
});

test("payrollCsvFilename includes the period", () => {
  assert.equal(payrollCsvFilename("2026-06-01"), "payroll-2026-06-01.csv");
});
