/** Pure CSV builder for a payroll period's calculations (no DB, no I/O). */

export type PayrollCsvRow = {
  vaId: string;
  name: string;
  compensationRole: string;
  compensationType: string;
  hoursInPeriod: number;
  hourlyRate: number | null;
  salaryPerPeriod: number | null;
  grossPay: number;
};

const HEADERS = [
  "VA ID",
  "Name",
  "Role",
  "Type",
  "Hours",
  "Rate",
  "Gross Pay",
  "Period Start",
  "Period End",
];

export function buildPayrollCsv(
  rows: readonly PayrollCsvRow[],
  period: { periodStart: string; periodEnd: string },
): string {
  const lines = [HEADERS.map(csvCell).join(",")];
  for (const r of rows) {
    const rate = r.compensationType === "salary" ? (r.salaryPerPeriod ?? 0) : (r.hourlyRate ?? 0);
    lines.push(
      [
        r.vaId,
        r.name,
        r.compensationRole,
        r.compensationType,
        r.hoursInPeriod.toFixed(2),
        rate.toFixed(2),
        r.grossPay.toFixed(2),
        period.periodStart,
        period.periodEnd,
      ].map(csvCell).join(","),
    );
  }
  const totalHours = rows.reduce((s, r) => s + r.hoursInPeriod, 0);
  const totalGross = rows.reduce((s, r) => s + r.grossPay, 0);
  lines.push(["TOTAL", "", "", "", totalHours.toFixed(2), "", totalGross.toFixed(2), "", ""].map(csvCell).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** RFC-4180 cell quoting. */
function csvCell(value: string | number): string {
  const s = String(value ?? "");
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function payrollCsvFilename(periodStart: string): string {
  return `payroll-${periodStart}.csv`;
}
