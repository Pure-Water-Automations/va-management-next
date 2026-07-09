import type { CompRole, CompensationType, PeriodStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { activeHoursSource } from "@/lib/services/hours-source";
import { computePeriodCalculations } from "@/lib/services/payroll-calc";

type PeriodInput = {
  periodStart?: unknown;
  periodEnd?: unknown;
  closeDate?: unknown;
  status?: unknown;
};

export async function createPeriod(input: PeriodInput) {
  const periodStart = requiredDate(input.periodStart, "periodStart");
  const periodEnd = requiredDate(input.periodEnd, "periodEnd");
  const closeDate = requiredDate(input.closeDate, "closeDate");
  const status = optionalPeriodStatus(input.status) ?? "open";

  if (periodEnd < periodStart) throw new Error("periodEnd must be on or after periodStart");

  const period = await db.payrollPeriod.upsert({
    where: { periodStart },
    update: {
      periodEnd,
      closeDate,
      status,
    },
    create: {
      periodStart,
      periodEnd,
      closeDate,
      status,
    },
  });

  await logActivity({
    source: "payroll_action",
    eventType: "period_saved",
    severity: "success",
    summary: `Payroll period saved: ${dateKey(period.periodStart)}`,
  });

  return period;
}

export async function recalculateOpenPeriod() {
  const period = await db.payrollPeriod.findFirst({
    where: { status: "open" },
    orderBy: { periodStart: "desc" },
  });
  if (!period) throw new Error("No open payroll period found.");

  const [vas, roles, gatewayHours] = await Promise.all([
    db.va.findMany({
      where: { status: { in: ["active", "training"] } },
      select: {
        vaId: true,
        name: true,
        compensationRole: true,
        status: true,
      },
      orderBy: { name: "asc" },
    }),
    db.compensationRole.findMany({
      select: {
        roleId: true,
        compensationType: true,
        hourlyRate: true,
        salaryPerPeriod: true,
      },
    }),
    loadTrainingUnpaidGatewayHours(),
  ]);

  const vaIds = vas.map((va) => va.vaId);
  const source = activeHoursSource();
  const [hoursByVaId, priorHoursByVaId] = await Promise.all([
    source.hoursByVa(period.periodStart, period.periodEnd, vaIds),
    source.priorHoursByVa(period.periodStart, vaIds),
  ]);

  const rows = computePeriodCalculations(
    vas,
    roles.map((role) => ({
      roleId: role.roleId,
      compensationType: role.compensationType,
      ...(role.hourlyRate != null ? { hourlyRate: role.hourlyRate } : {}),
      ...(role.salaryPerPeriod != null ? { salaryPerPeriod: role.salaryPerPeriod } : {}),
    })),
    hoursByVaId,
    {
      trainingUnpaidGatewayHours: gatewayHours,
      priorHoursByVaId,
    },
  );

  if (rows.length > 0) {
    await db.$transaction(
      rows.map((row) =>
        db.payrollCalculation.upsert({
          where: {
            periodStart_vaId: {
              periodStart: period.periodStart,
              vaId: row.vaId,
            },
          },
          update: {
            periodEnd: period.periodEnd,
            name: row.name,
            compensationRole: row.compensationRole as CompRole,
            compensationType: row.compensationType as CompensationType,
            hoursInPeriod: row.hoursInPeriod,
            hourlyRate: row.hourlyRate ?? null,
            salaryPerPeriod: row.salaryPerPeriod ?? null,
            grossPay: row.grossPay,
          },
          create: {
            periodStart: period.periodStart,
            periodEnd: period.periodEnd,
            vaId: row.vaId,
            name: row.name,
            compensationRole: row.compensationRole as CompRole,
            compensationType: row.compensationType as CompensationType,
            hoursInPeriod: row.hoursInPeriod,
            hourlyRate: row.hourlyRate ?? null,
            salaryPerPeriod: row.salaryPerPeriod ?? null,
            grossPay: row.grossPay,
          },
        }),
      ),
    );
  }

  const periodTotalHours = rows.reduce((sum, row) => sum + row.hoursInPeriod, 0);
  const periodTotalPayroll = rows.reduce((sum, row) => sum + row.grossPay, 0);
  const updatedPeriod = await db.payrollPeriod.update({
    where: { periodStart: period.periodStart },
    data: {
      periodTotalHours,
      periodTotalPayroll,
    },
  });

  await logActivity({
    source: "payroll_action",
    eventType: "period_recalculated",
    severity: "success",
    summary: `Payroll recalculated for ${dateKey(period.periodStart)}.`,
  });

  return {
    period: updatedPeriod,
    rows,
    totalHours: periodTotalHours,
    totalPayroll: periodTotalPayroll,
  };
}

export async function lockOpenPeriod() {
  // Approval gate (proposal §6.2): every row must be resolved.
  const open = await db.payrollPeriod.findFirst({
    where: { status: "open" },
    orderBy: { periodStart: "desc" },
  });
  if (open) {
    const unresolved = await db.payrollCalculation.count({
      where: { periodStart: open.periodStart, rowStatus: { in: ["submitted"] } },
    });
    if (unresolved > 0) {
      throw new Error(`Cannot lock: ${unresolved} row(s) still awaiting approval.`);
    }
  }

  const recalculated = await recalculateOpenPeriod();
  const period = await db.payrollPeriod.update({
    where: { periodStart: recalculated.period.periodStart },
    data: {
      status: "closed",
      bookkeeperEmailSentAt: new Date(),
    },
  });

  await logActivity({
    source: "payroll_action",
    eventType: "period_locked",
    severity: "success",
    summary: `Payroll period locked: ${dateKey(period.periodStart)}.`,
  });

  return { ...recalculated, period };
}

export async function markPeriodPaid(periodStartInput: unknown) {
  const periodStart = requiredDate(periodStartInput, "periodStart");
  const period = await db.payrollPeriod.update({
    where: { periodStart },
    data: { status: "paid" },
  });

  await logActivity({
    source: "payroll_action",
    eventType: "period_paid",
    severity: "success",
    summary: `Payroll period marked paid: ${dateKey(period.periodStart)}.`,
  });

  return period;
}

export async function reopenPeriod(periodStartInput: unknown) {
  const periodStart = requiredDate(periodStartInput, "periodStart");
  const period = await db.payrollPeriod.update({
    where: { periodStart },
    data: { status: "open" },
  });

  await logActivity({
    source: "payroll_action",
    eventType: "period_reopened",
    severity: "warning",
    summary: `Payroll period reopened: ${dateKey(period.periodStart)}.`,
  });

  return period;
}

async function loadTrainingUnpaidGatewayHours(): Promise<number> {
  const [policy, setting] = await Promise.all([
    db.policy.findUnique({
      where: { key: "training_unpaid_gateway_hours" },
      select: { value: true },
    }),
    db.setting.findUnique({
      where: { key: "training_unpaid_gateway_hours" },
      select: { value: true },
    }),
  ]);

  return numberOrFallback(policy?.value, numberOrFallback(setting?.value, 0));
}

function optionalPeriodStatus(value: unknown): PeriodStatus | undefined {
  if (value == null || value === "") return undefined;
  if (value === "open" || value === "closed" || value === "paid") return value;
  throw new Error("Invalid payroll period status");
}

function requiredDate(value: unknown, field: string): Date {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return dateOnly(value);
  }

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing field: ${field}`);
  }

  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const date = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : new Date(trimmed);

  if (Number.isNaN(date.getTime())) throw new Error(`Invalid date: ${field}`);
  return dateOnly(date);
}

function dateOnly(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function numberOrFallback(value: string | null | undefined, fallback: number): number {
  if (value == null || value.trim() === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
