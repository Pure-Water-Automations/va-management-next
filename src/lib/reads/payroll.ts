import { db } from "@/lib/db";

export type PayrollDashboard = Awaited<ReturnType<typeof getPayrollDashboard>>;

export async function getPayrollDashboard() {
  const openPeriod =
    (await db.payrollPeriod.findFirst({ where: { status: "open" }, orderBy: { periodStart: "desc" } })) ??
    (await db.payrollPeriod.findFirst({ orderBy: { periodStart: "desc" } }));

  const calcRows = openPeriod
    ? await db.payrollCalculation.findMany({
        where: { periodStart: openPeriod.periodStart },
        orderBy: { name: "asc" },
      })
    : [];

  const [rateChanges, pastPeriods] = await Promise.all([
    db.tierReview.findMany({
      where: { status: "approved" },
      orderBy: { hrDecisionDate: "desc" },
      take: 8,
    }),
    db.payrollPeriod.findMany({
      where: { status: { in: ["closed", "paid"] } },
      orderBy: { periodStart: "desc" },
      take: 8,
    }),
  ]);

  const totalGross = calcRows.reduce((s, r) => s + (r.grossPay ?? 0), 0);
  const totalHours = calcRows.reduce((s, r) => s + (r.hoursInPeriod ?? 0), 0);

  return { openPeriod, calcRows, rateChanges, pastPeriods, totalGross, totalHours };
}
