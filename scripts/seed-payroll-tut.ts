/**
 * Payroll tutorial seed — DISPOSABLE va_console_tut DB only.
 * Fake, no-PII demo data so the /payroll console renders fully populated.
 *
 *   npx tsx scripts/seed-payroll-tut.ts          # seed
 *   npx tsx scripts/seed-payroll-tut.ts purge    # remove demo rows
 *   npx tsx scripts/seed-payroll-tut.ts verify    # assert demo count == 0
 *
 * Demo markers: VA ids prefixed DEMOVA-, emails @demo.payroll.example.
 * (Primary cleanup is DROP DATABASE va_console_tut; purge is the belt-and-braces.)
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const OPERATOR_EMAIL = "okamotomiak@gmail.com";
const D = (s: string) => new Date(`${s}T00:00:00.000Z`);

// --- comp roles (rate card) ---
const ROLES = [
  { roleId: "TRAINEE", roleName: "Trainee", compensationType: "hourly", hourlyRate: 5, nextRoleId: "TIER_1", minTotalHoursToReachNext: 80 },
  { roleId: "TIER_1", roleName: "Tier 1 VA", compensationType: "hourly", hourlyRate: 7, nextRoleId: "TIER_2", minTotalHoursToReachNext: 500 },
  { roleId: "TIER_2", roleName: "Tier 2 VA", compensationType: "hourly", hourlyRate: 9, nextRoleId: "TIER_3", minTotalHoursToReachNext: 1200 },
  { roleId: "TIER_3", roleName: "Tier 3 Lead", compensationType: "salary", salaryPerPeriod: 1200, nextRoleId: "TIER_4", minTotalHoursToReachNext: 2400 },
  { roleId: "TIER_4", roleName: "Tier 4 Manager", compensationType: "salary", salaryPerPeriod: 1600, nextRoleId: null },
] as const;

// --- fake VAs ---
const VAS = [
  { vaId: "DEMOVA-001", name: "Maya Okonkwo", compensationRole: "TIER_2", status: "active", periodHours: 71.5 },
  { vaId: "DEMOVA-002", name: "Diego Salcedo", compensationRole: "TIER_1", status: "active", periodHours: 64.0 },
  { vaId: "DEMOVA-003", name: "Priya Nair", compensationRole: "TIER_3", status: "active", periodHours: 78.5 },
  { vaId: "DEMOVA-004", name: "Tomas Brandt", compensationRole: "TRAINEE", status: "training", periodHours: 38.0 },
  { vaId: "DEMOVA-005", name: "Lena Fischer", compensationRole: "TIER_4", status: "active", periodHours: 80.0 },
  { vaId: "DEMOVA-006", name: "Sam Ruiz", compensationRole: "TIER_1", status: "active", periodHours: 58.5 },
] as const;

// --- periods ---
const OPEN = { periodStart: "2026-06-16", periodEnd: "2026-06-30", closeDate: "2026-07-02" };
const PAST = [
  { periodStart: "2026-06-01", periodEnd: "2026-06-15", closeDate: "2026-06-17", status: "paid", hours: 402.0, payroll: 3120 },
  { periodStart: "2026-05-16", periodEnd: "2026-05-31", closeDate: "2026-06-02", status: "paid", hours: 388.5, payroll: 3015 },
  { periodStart: "2026-05-01", periodEnd: "2026-05-15", closeDate: "2026-05-17", status: "closed", hours: 371.0, payroll: 2880 },
];

const roleById = Object.fromEntries(ROLES.map((r) => [r.roleId, r]));
const gross = (va: (typeof VAS)[number]) => {
  const r = roleById[va.compensationRole];
  return r.compensationType === "salary" ? r.salaryPerPeriod! : va.periodHours * r.hourlyRate!;
};

async function seed() {
  // operator login (admin bypasses role guards)
  await db.user.upsert({
    where: { email: OPERATOR_EMAIL },
    update: { role: "HR_MANAGER", isAdmin: true, active: true, name: "Justin Okamoto" },
    create: { email: OPERATOR_EMAIL, name: "Justin Okamoto", role: "HR_MANAGER", isAdmin: true, active: true },
  });

  for (const r of ROLES) {
    await db.compensationRole.upsert({
      where: { roleId: r.roleId as any },
      update: { roleName: r.roleName, compensationType: r.compensationType as any, hourlyRate: (r as any).hourlyRate ?? null, salaryPerPeriod: (r as any).salaryPerPeriod ?? null, nextRoleId: (r.nextRoleId as any) ?? null, minTotalHoursToReachNext: (r as any).minTotalHoursToReachNext ?? null },
      create: { roleId: r.roleId as any, roleName: r.roleName, compensationType: r.compensationType as any, hourlyRate: (r as any).hourlyRate ?? null, salaryPerPeriod: (r as any).salaryPerPeriod ?? null, nextRoleId: (r.nextRoleId as any) ?? null, minTotalHoursToReachNext: (r as any).minTotalHoursToReachNext ?? null },
    });
  }

  for (const v of VAS) {
    await db.va.upsert({
      where: { vaId: v.vaId },
      update: { name: v.name, email: `${v.vaId.toLowerCase()}@demo.payroll.example`, compensationRole: v.compensationRole as any, status: v.status as any, desklogUserId: v.vaId },
      create: { vaId: v.vaId, name: v.name, email: `${v.vaId.toLowerCase()}@demo.payroll.example`, compensationRole: v.compensationRole as any, status: v.status as any, desklogUserId: v.vaId },
    });
  }

  // periods
  await db.payrollPeriod.upsert({
    where: { periodStart: D(OPEN.periodStart) },
    update: { periodEnd: D(OPEN.periodEnd), closeDate: D(OPEN.closeDate), status: "open" },
    create: { periodStart: D(OPEN.periodStart), periodEnd: D(OPEN.periodEnd), closeDate: D(OPEN.closeDate), status: "open" },
  });
  for (const p of PAST) {
    await db.payrollPeriod.upsert({
      where: { periodStart: D(p.periodStart) },
      update: { periodEnd: D(p.periodEnd), closeDate: D(p.closeDate), status: p.status as any, periodTotalHours: p.hours, periodTotalPayroll: p.payroll },
      create: { periodStart: D(p.periodStart), periodEnd: D(p.periodEnd), closeDate: D(p.closeDate), status: p.status as any, periodTotalHours: p.hours, periodTotalPayroll: p.payroll },
    });
  }

  // desk-log hours for the OPEN period (a few rows per VA across dates summing to periodHours)
  await db.deskLogHours.deleteMany({ where: { vaId: { startsWith: "DEMOVA-" } } });
  const days = ["2026-06-17", "2026-06-19", "2026-06-23", "2026-06-25", "2026-06-29"];
  for (const v of VAS) {
    const per = Math.round((v.periodHours / days.length) * 10) / 10;
    let remaining = v.periodHours;
    for (let i = 0; i < days.length; i++) {
      const hrs = i === days.length - 1 ? Math.round(remaining * 10) / 10 : per;
      remaining = Math.round((remaining - per) * 10) / 10;
      await db.deskLogHours.create({
        data: { date: D(days[i]), vaId: v.vaId, desklogUserId: v.vaId, project: "Client delivery", task: "Daily ops", billable: true, taskSpentHrs: hrs, timeAtWorkHrs: hrs + 0.5 },
      });
    }
  }

  // payroll calculations for the OPEN period
  await db.payrollCalculation.deleteMany({ where: { vaId: { startsWith: "DEMOVA-" } } });
  let totHours = 0;
  let totGross = 0;
  for (const v of VAS) {
    const r = roleById[v.compensationRole];
    const g = gross(v);
    totHours += v.periodHours;
    totGross += g;
    await db.payrollCalculation.create({
      data: {
        periodStart: D(OPEN.periodStart), periodEnd: D(OPEN.periodEnd), vaId: v.vaId, name: v.name,
        compensationRole: v.compensationRole as any, compensationType: r.compensationType as any,
        hoursInPeriod: v.periodHours, hourlyRate: (r as any).hourlyRate ?? null, salaryPerPeriod: (r as any).salaryPerPeriod ?? null, grossPay: g,
      },
    });
  }
  await db.payrollPeriod.update({ where: { periodStart: D(OPEN.periodStart) }, data: { periodTotalHours: totHours, periodTotalPayroll: totGross } });

  // approved rate changes → "Rate-change history" card
  await db.tierReview.deleteMany({ where: { vaId: { startsWith: "DEMOVA-" } } });
  const reviews = [
    { vaId: "DEMOVA-002", vaName: "Diego Salcedo", currentRole: "TRAINEE", targetRole: "TIER_1", hrDecisionDate: "2026-06-12" },
    { vaId: "DEMOVA-001", vaName: "Maya Okonkwo", currentRole: "TIER_1", targetRole: "TIER_2", hrDecisionDate: "2026-05-28" },
    { vaId: "DEMOVA-006", vaName: "Sam Ruiz", currentRole: "TRAINEE", targetRole: "TIER_1", hrDecisionDate: "2026-05-20" },
  ];
  for (const rv of reviews) {
    await db.tierReview.create({
      data: { vaId: rv.vaId, vaName: rv.vaName, currentRole: rv.currentRole as any, targetRole: rv.targetRole as any, status: "approved", hrDecisionDate: D(rv.hrDecisionDate), cumulativeHoursAtTrigger: 520 },
    });
  }

  const periods = await db.payrollPeriod.count();
  console.log(`Seeded: ${VAS.length} VAs, ${periods} periods, open-period gross $${totGross}, ${reviews.length} rate changes.`);
}

async function purge() {
  await db.payrollCalculation.deleteMany({ where: { vaId: { startsWith: "DEMOVA-" } } });
  await db.tierReview.deleteMany({ where: { vaId: { startsWith: "DEMOVA-" } } });
  await db.deskLogHours.deleteMany({ where: { vaId: { startsWith: "DEMOVA-" } } });
  await db.payrollPeriod.deleteMany({ where: { periodStart: { gte: D("2026-05-01") } } });
  await db.va.deleteMany({ where: { vaId: { startsWith: "DEMOVA-" } } });
  console.log("Purged demo payroll rows.");
}

async function verify() {
  const n =
    (await db.va.count({ where: { vaId: { startsWith: "DEMOVA-" } } })) +
    (await db.payrollCalculation.count({ where: { vaId: { startsWith: "DEMOVA-" } } })) +
    (await db.tierReview.count({ where: { vaId: { startsWith: "DEMOVA-" } } })) +
    (await db.deskLogHours.count({ where: { vaId: { startsWith: "DEMOVA-" } } }));
  console.log(`Demo row count: ${n}`);
  if (n !== 0) process.exit(1);
}

const mode = process.argv[2] ?? "seed";
(mode === "purge" ? purge() : mode === "verify" ? verify() : seed())
  .then(() => db.$disconnect())
  .catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
