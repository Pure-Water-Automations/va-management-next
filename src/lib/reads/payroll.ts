import { db } from "@/lib/db";
import { activeHoursSource, type HoursBreakdownRow } from "@/lib/services/hours-source";
import { detectAnomalies } from "@/lib/services/payroll-anomalies";
import { nextPeriodAfter, periodContaining } from "@/lib/services/pay-schedule";

export type PayrollDashboard = Awaited<ReturnType<typeof getPayrollDashboard>>;

export async function getPayrollDashboard() {
  const openPeriod =
    (await db.payrollPeriod.findFirst({ where: { status: "open" }, orderBy: { periodStart: "desc" } })) ??
    (await db.payrollPeriod.findFirst({ orderBy: { periodStart: "desc" } }));

  const [calcRows, vas, profiles, rateChanges, pastPeriods] = await Promise.all([
    openPeriod
      ? db.payrollCalculation.findMany({
          where: { periodStart: openPeriod.periodStart },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    db.va.findMany({
      where: { status: { in: ["active", "training"] } },
      select: {
        vaId: true,
        supervisorVaId: true,
        trustedForBulkApprove: true,
        email: true,
        targetHoursWeekly: true,
      },
    }),
    db.vaPaymentProfile.findMany(),
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

  const vaById = new Map(vas.map((v) => [v.vaId, v]));
  const profileByVa = new Map(profiles.map((p) => [p.vaId, p]));
  const liveFlagsByVa = openPeriod
    ? await buildLiveFlags(
        openPeriod.periodStart,
        openPeriod.periodEnd,
        calcRows.map((r) => ({
          vaId: r.vaId,
          hoursInPeriod: r.hoursInPeriod,
          targetHoursWeekly: vaById.get(r.vaId)?.targetHoursWeekly ?? null,
        })),
      )
    : new Map<string, string[]>();

  const rows = calcRows.map((r) => {
    const storedReasons = stringArray(r.flagReasons);
    const liveReasons = liveFlagsByVa.get(r.vaId) ?? [];
    const flagReasons = uniqueStrings([...storedReasons, ...liveReasons]);
    return {
      ...r,
      flagReasons,
      flagged: r.flagged || flagReasons.length > 0,
      payMethod: profileByVa.get(r.vaId)?.method ?? null,
      payCurrency: profileByVa.get(r.vaId)?.payoutCurrency ?? "USD",
      trusted: vaById.get(r.vaId)?.trustedForBulkApprove ?? false,
      supervisorVaId: vaById.get(r.vaId)?.supervisorVaId ?? null,
      email: vaById.get(r.vaId)?.email ?? null,
    };
  });

  const totalGross = rows.reduce((s, r) => s + (r.grossPay ?? 0), 0);
  const totalHours = rows.reduce((s, r) => s + (r.hoursInPeriod ?? 0), 0);
  const beingPaid = rows.filter((r) => r.rowStatus !== "excluded" && (r.hoursInPeriod > 0 || r.compensationType === "salary")).length;
  const statusCounts = {
    submitted: rows.filter((r) => r.rowStatus === "submitted").length,
    approved: rows.filter((r) => r.rowStatus === "approved").length,
    paid: rows.filter((r) => r.rowStatus === "paid").length,
    excluded: rows.filter((r) => r.rowStatus === "excluded").length,
  };
  const nextRun = openPeriod?.status === "open" ? openPeriod.closeDate : nextPeriodAfter(periodContaining(new Date())).runDate;

  return {
    openPeriod,
    rows,
    calcRows: rows,
    activeVaCount: vas.length,
    rateChanges,
    pastPeriods,
    totalGross,
    totalHours,
    beingPaid,
    statusCounts,
    nextRun,
  };
}

export type VaPeriodBreakdown = {
  byProject: {
    project: string;
    clientOrgName: string | null;
    mapped: boolean;
    hours: number;
    tasks: { task: string; hours: number }[];
  }[];
  needsReviewDays: number;
  efficiencyPct: number | null;
};

/** Per-VA drill-down: hours per project/task, mapped to clients. */
export async function getVaPeriodBreakdown(vaId: string, periodStart: Date, periodEnd: Date): Promise<VaPeriodBreakdown> {
  const source = activeHoursSource();
  const [rows, maps, eff] = await Promise.all([
    source.breakdown(periodStart, periodEnd, [vaId]),
    db.clientProjectMap.findMany(),
    db.deskLogEfficiency.aggregate({
      where: { vaId, date: { gte: periodStart, lte: periodEnd } },
      _avg: { efficiencyPct: true },
    }),
  ]);
  const orgIds = maps.map((m) => m.clientOrgId).filter((x): x is string => !!x);
  const orgs = orgIds.length
    ? await db.clientOrganization.findMany({ where: { id: { in: orgIds } }, select: { id: true, name: true } })
    : [];
  const orgName = new Map(orgs.map((o) => [o.id, o.name]));
  const mapByProject = new Map(maps.map((m) => [m.project, m]));

  const byProject = new Map<string, { hours: number; tasks: Map<string, number> }>();
  let needsReviewDays = 0;
  for (const r of rows) {
    const project = r.project ?? "(no project)";
    const entry = byProject.get(project) ?? { hours: 0, tasks: new Map<string, number>() };
    entry.hours += r.hours;
    const task = r.task ?? "(no task)";
    entry.tasks.set(task, (entry.tasks.get(task) ?? 0) + r.hours);
    byProject.set(project, entry);
    if (r.needsReview) needsReviewDays++;
  }

  return {
    byProject: [...byProject.entries()]
      .map(([project, entry]) => {
        const mappedProject = mapByProject.get(project);
        return {
          project,
          mapped: !!mappedProject,
          clientOrgName: mappedProject?.clientOrgId ? (orgName.get(mappedProject.clientOrgId) ?? null) : mappedProject ? "Internal" : null,
          hours: roundHours(entry.hours),
          tasks: [...entry.tasks.entries()]
            .map(([task, hours]) => ({ task, hours: roundHours(hours) }))
            .sort((a, b) => b.hours - a.hours),
        };
      })
      .sort((a, b) => b.hours - a.hours),
    needsReviewDays,
    efficiencyPct: eff._avg.efficiencyPct,
  };
}

type FlagInputRow = {
  vaId: string;
  hoursInPeriod: number;
  targetHoursWeekly: number | null;
};

async function buildLiveFlags(periodStart: Date, periodEnd: Date, rows: FlagInputRow[]): Promise<Map<string, string[]>> {
  if (rows.length === 0) return new Map();

  const vaIds = rows.map((r) => r.vaId);
  const source = activeHoursSource();
  const [trailing, breakdownRows, priorBreakdown, settings] = await Promise.all([
    db.payrollCalculation.findMany({
      where: { vaId: { in: vaIds }, periodStart: { lt: periodStart } },
      orderBy: { periodStart: "desc" },
      take: 3 * vaIds.length,
      select: { vaId: true, hoursInPeriod: true },
    }),
    source.breakdown(periodStart, periodEnd, vaIds),
    source.breakdown(new Date(periodStart.getTime() - 90 * 24 * 60 * 60 * 1000), new Date(periodStart.getTime() - 1), vaIds),
    db.setting.findUnique({ where: { key: "payroll_spike_multiplier" }, select: { value: true } }),
  ]);

  const spikeMultiplier = Number(settings?.value) > 1 ? Number(settings?.value) : 1.5;
  const weeksInPeriod = (periodEnd.getTime() - periodStart.getTime()) / (7 * 24 * 60 * 60 * 1000) + 1 / 7;
  const trailingByVa = new Map<string, number[]>();
  for (const t of trailing) {
    const arr = trailingByVa.get(t.vaId) ?? [];
    if (arr.length < 3) arr.push(t.hoursInPeriod);
    trailingByVa.set(t.vaId, arr);
  }

  const knownProjects = projectsByVa(priorBreakdown);
  const periodProjects = projectsByVa(breakdownRows);
  const reviewDays = new Map<string, number>();
  for (const row of breakdownRows) {
    if (row.needsReview) reviewDays.set(row.vaId, (reviewDays.get(row.vaId) ?? 0) + 1);
  }

  const flagsByVa = new Map<string, string[]>();
  for (const row of rows) {
    const trailingPeriodHours = trailingByVa.get(row.vaId) ?? [];
    const known = knownProjects.get(row.vaId);
    const newProjects = [...(periodProjects.get(row.vaId) ?? [])].filter((project) => !(known?.has(project) ?? false));
    flagsByVa.set(
      row.vaId,
      detectAnomalies({
        hoursInPeriod: row.hoursInPeriod,
        trailingPeriodHours,
        targetHoursWeekly: row.targetHoursWeekly,
        weeksInPeriod,
        needsReviewDays: reviewDays.get(row.vaId) ?? 0,
        newProjects,
        wasActiveLastPeriod: trailingPeriodHours.length > 0 && (trailingPeriodHours[0] ?? 0) > 0,
        spikeMultiplier,
      }),
    );
  }
  return flagsByVa;
}

function projectsByVa(rows: HoursBreakdownRow[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const row of rows) {
    if (!row.project) continue;
    let projects = out.get(row.vaId);
    if (!projects) {
      projects = new Set<string>();
      out.set(row.vaId, projects);
    }
    projects.add(row.project);
  }
  return out;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}

function roundHours(hours: number): number {
  return Math.round(hours * 100) / 100;
}
