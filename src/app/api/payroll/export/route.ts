import { getCurrentUser } from "@/lib/auth/access";
import { db } from "@/lib/db";
import { audit } from "@/lib/activity";
import { buildPayrollCsv, payrollCsvFilename } from "@/lib/services/payroll-csv";

const ALLOWED = new Set(["BOOKKEEPER", "HR_MANAGER", "PEOPLE_OPS"]);

export async function GET(request: Request): Promise<Response> {
  let user;
  try {
    user = await getCurrentUser();
  } catch {
    return new Response("Not authenticated", { status: 401 });
  }
  if (!user.isAdmin && !ALLOWED.has(user.role)) {
    return new Response("Not authorized", { status: 403 });
  }

  const url = new URL(request.url);
  const periodParam = url.searchParams.get("period");

  const period = periodParam
    ? await db.payrollPeriod.findUnique({ where: { periodStart: new Date(`${periodParam}T00:00:00.000Z`) } })
    : await db.payrollPeriod.findFirst({ orderBy: { periodStart: "desc" } });

  if (!period) return new Response("No payroll period found", { status: 404 });

  const calcs = await db.payrollCalculation.findMany({
    where: { periodStart: period.periodStart },
    orderBy: { name: "asc" },
  });

  const startKey = period.periodStart.toISOString().slice(0, 10);
  const endKey = period.periodEnd.toISOString().slice(0, 10);
  const csv = buildPayrollCsv(
    calcs.map((c) => ({
      vaId: c.vaId,
      name: c.name,
      compensationRole: c.compensationRole,
      compensationType: c.compensationType,
      hoursInPeriod: c.hoursInPeriod,
      hourlyRate: c.hourlyRate,
      salaryPerPeriod: c.salaryPerPeriod,
      grossPay: c.grossPay,
    })),
    { periodStart: startKey, periodEnd: endKey },
  );

  await audit({ actorEmail: user.email, action: "payroll_export", target: startKey, ok: true });

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${payrollCsvFilename(startKey)}"`,
      "Cache-Control": "no-store",
    },
  });
}
