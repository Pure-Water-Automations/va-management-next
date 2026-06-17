import test from "node:test";
import assert from "node:assert/strict";

import {
  computeGrossPay,
  computePeriodCalculations,
} from "../src/lib/services/payroll-calc";

test("computeGrossPay returns salary per period for salary roles", () => {
  assert.equal(
    computeGrossPay({
      compensationType: "salary",
      hoursInPeriod: 80,
      hourlyRate: 10,
      salaryPerPeriod: 1_250,
      unpaidGatewayHours: 10,
    }),
    1_250,
  );
});

test("computeGrossPay pays hourly roles for hours after unpaid gateway", () => {
  assert.equal(
    computeGrossPay({
      compensationType: "hourly",
      hoursInPeriod: 18,
      hourlyRate: 7.5,
      unpaidGatewayHours: 10,
    }),
    60,
  );
});

test("computeGrossPay floors gateway-adjusted hourly hours at zero", () => {
  assert.equal(
    computeGrossPay({
      compensationType: "hourly",
      hoursInPeriod: 6,
      hourlyRate: 7.5,
      unpaidGatewayHours: 10,
    }),
    0,
  );
});

test("computePeriodCalculations applies trainee gateway and returns calculation rows", () => {
  const rows = computePeriodCalculations(
    [
      { vaId: "va_1", name: "Trainee VA", compensationRole: "TRAINEE", status: "training" },
      { vaId: "va_2", name: "Tier VA", compensationRole: "TIER_1", status: "active" },
      { vaId: "va_3", name: "Salary VA", compensationRole: "TIER_4", status: "active" },
    ],
    [
      { roleId: "TRAINEE", compensationType: "hourly", hourlyRate: 5 },
      { roleId: "TIER_1", compensationType: "hourly", hourlyRate: 8 },
      { roleId: "TIER_4", compensationType: "salary", salaryPerPeriod: 900 },
    ],
    { va_1: 12, va_2: 12, va_3: 12 },
    { trainingUnpaidGatewayHours: 10, priorHoursByVaId: { va_1: 6 } },
  );

  assert.deepEqual(rows, [
    {
      vaId: "va_1",
      name: "Trainee VA",
      compensationRole: "TRAINEE",
      compensationType: "hourly",
      hoursInPeriod: 12,
      hourlyRate: 5,
      grossPay: 40,
    },
    {
      vaId: "va_2",
      name: "Tier VA",
      compensationRole: "TIER_1",
      compensationType: "hourly",
      hoursInPeriod: 12,
      hourlyRate: 8,
      grossPay: 96,
    },
    {
      vaId: "va_3",
      name: "Salary VA",
      compensationRole: "TIER_4",
      compensationType: "salary",
      hoursInPeriod: 12,
      salaryPerPeriod: 900,
      grossPay: 900,
    },
  ]);
});
