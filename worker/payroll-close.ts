/**
 * AUTO_payrollClose — daily. For the open period: T-3 / T-1 reminder emails to
 * active VAs, and on the close date compute PayrollCalculation rows, mark the
 * period closed, and email the bookkeeper a CSV. Idempotent per stage via the
 * reminder/close timestamps on PayrollPeriod.
 */
import { db } from "@/lib/db";
import { activeHoursSource } from "@/lib/services/hours-source";
import { computePeriodCalculations } from "@/lib/services/payroll-calc";
import { logActivity } from "@/lib/activity";
import { sendSystemEmail } from "@/lib/email";
import { loadSettings, num, str } from "@/lib/settings";

const DAY = 24 * 60 * 60 * 1000;
const todayMidnight = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

async function recalc(periodStart: Date, periodEnd: Date, unpaidGateway: number) {
  const [vas, roles, hoursByVaId] = await Promise.all([
    db.va.findMany({ where: { status: { in: ["active", "training"] } } }),
    db.compensationRole.findMany(),
    activeHoursSource().hoursByVa(periodStart, periodEnd),
  ]);
  const rows = computePeriodCalculations(
    vas.map((v) => ({
      vaId: v.vaId,
      name: v.name,
      compensationRole: v.compensationRole,
    })),
    roles.map((r) => ({
      roleId: r.roleId,
      compensationType: r.compensationType,
      hourlyRate: r.hourlyRate ?? undefined,
      salaryPerPeriod: r.salaryPerPeriod ?? undefined,
    })),
    hoursByVaId,
    { unpaidGatewayHours: unpaidGateway },
  );
  for (const row of rows) {
    await db.payrollCalculation.upsert({
      where: { periodStart_vaId: { periodStart, vaId: row.vaId } },
      update: {
        periodEnd,
        name: row.name,
        compensationRole: row.compensationRole as never,
        compensationType: row.compensationType,
        hoursInPeriod: row.hoursInPeriod,
        hourlyRate: row.hourlyRate ?? null,
        salaryPerPeriod: row.salaryPerPeriod ?? null,
        grossPay: row.grossPay,
      },
      create: {
        periodStart,
        periodEnd,
        vaId: row.vaId,
        name: row.name,
        compensationRole: row.compensationRole as never,
        compensationType: row.compensationType,
        hoursInPeriod: row.hoursInPeriod,
        hourlyRate: row.hourlyRate ?? null,
        salaryPerPeriod: row.salaryPerPeriod ?? null,
        grossPay: row.grossPay,
      },
    });
  }
  const totalHours = rows.reduce((s, r) => s + r.hoursInPeriod, 0);
  const totalGross = rows.reduce((s, r) => s + r.grossPay, 0);
  await db.payrollPeriod.update({
    where: { periodStart },
    data: { periodTotalHours: totalHours, periodTotalPayroll: totalGross },
  });
  return { rows, totalHours, totalGross };
}

function toCsv(rows: { name: string; compensationRole: string; hoursInPeriod: number; grossPay: number }[]) {
  const head = "name,role,hours,gross_pay";
  const body = rows.map((r) => `${r.name},${r.compensationRole},${r.hoursInPeriod},${r.grossPay}`).join("\n");
  return `${head}\n${body}`;
}

async function main() {
  const run = await db.syncRun.create({ data: { worker: "payroll-close", status: "FAILED" } });
  try {
    const settings = await loadSettings();
    const from = str(settings, "system_email_from", "");
    const bookkeeper = str(settings, "bookkeeper_email", "");
    const unpaidGateway = num(settings, "training_unpaid_gateway_hours", 0);

    const period = await db.payrollPeriod.findFirst({
      where: { status: "open" },
      orderBy: { periodStart: "asc" },
    });
    let action = "none";
    if (period) {
      const today = todayMidnight();
      const daysToClose = Math.round((period.closeDate.getTime() - today.getTime()) / DAY);
      const activeVas = await db.va.findMany({ where: { status: { in: ["active", "training"] } } });

      if (daysToClose === 3 && !period.reminder3dSentAt && from) {
        for (const v of activeVas)
          if (v.email)
            await sendSystemEmail({ from, to: v.email, subject: "Payroll closes in 3 days", body: "Please make sure your DeskLog hours are up to date — payroll closes in 3 days." });
        await db.payrollPeriod.update({ where: { periodStart: period.periodStart }, data: { reminder3dSentAt: new Date() } });
        action = "reminder_t3";
      } else if (daysToClose === 1 && !period.reminder1dSentAt && from) {
        for (const v of activeVas)
          if (v.email)
            await sendSystemEmail({ from, to: v.email, subject: "Payroll closes tomorrow", body: "Final reminder — payroll closes tomorrow. Please confirm your DeskLog hours." });
        await db.payrollPeriod.update({ where: { periodStart: period.periodStart }, data: { reminder1dSentAt: new Date() } });
        action = "reminder_t1";
      } else if (daysToClose <= 0) {
        const { rows, totalGross } = await recalc(period.periodStart, period.periodEnd, unpaidGateway);
        await db.payrollPeriod.update({
          where: { periodStart: period.periodStart },
          data: { status: "closed", bookkeeperEmailSentAt: from && bookkeeper ? new Date() : null },
        });
        if (from && bookkeeper)
          await sendSystemEmail({ from, to: bookkeeper, subject: "Payroll period closed — calculations attached", body: `Period ${period.periodStart.toISOString().slice(0, 10)} closed.\n\n${toCsv(rows)}` });
        await logActivity({ source: "payroll_close", eventType: "period_closed", summary: `Closed period ${period.periodStart.toISOString().slice(0, 10)} — ${rows.length} VAs, $${totalGross.toFixed(2)}` });
        action = "closed";
      }
    }

    await db.syncRun.update({ where: { id: run.id }, data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { action } } });
    console.log(`payroll-close: ${action}`);
  } catch (err) {
    await db.syncRun.update({ where: { id: run.id }, data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] } });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`payroll-close failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
