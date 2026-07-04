/**
 * DEMO SEED — populates a THROWAWAY demo database with entirely fake data so the
 * VA Manager console can be screen-recorded (tutorial-factory) without exposing
 * any real VA, candidate, or payroll information.
 *
 * SAFETY — this script is DESTRUCTIVE (it wipes + repopulates) and is HARD-GUARDED
 * to only ever run against a database whose name contains "demo". It refuses to
 * touch `va_console` (local dev), `va_console_local`, or any production database.
 * There is no override flag by design.
 *
 * Run it (local):
 *   createdb va_console_demo   # once
 *   DATABASE_URL="postgresql://va_console@localhost:5432/va_console_demo" \
 *     npx prisma migrate deploy
 *   DATABASE_URL="postgresql://va_console@localhost:5432/va_console_demo" \
 *     npx tsx prisma/seed-demo.ts
 *
 * Then run the app against the demo DB in demo mode (see AGENTS.md § Demo mode).
 */
import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";

loadEnvConfig(process.cwd());

// ── Hard safety guard ───────────────────────────────────────────────────────
// Parse the target DB name from DATABASE_URL and refuse anything that isn't an
// obvious demo database. This makes it structurally impossible to wipe the real
// dev/prod data with a stray invocation.
const DEMO_HR_EMAIL = "hr.demo@example.com";

function assertDemoDatabase(url: string | undefined): string {
  if (!url) throw new Error("seed-demo: DATABASE_URL is not set.");
  let dbName: string;
  try {
    dbName = new URL(url).pathname.replace(/^\//, "");
  } catch {
    throw new Error("seed-demo: DATABASE_URL is not a valid URL.");
  }
  if (!/demo/i.test(dbName)) {
    throw new Error(
      `seed-demo: REFUSING to run — target database "${dbName}" is not a demo database ` +
        `(its name must contain "demo"). This script wipes data; point it at e.g. va_console_demo.`,
    );
  }
  return dbName;
}

const dbName = assertDemoDatabase(process.env.DATABASE_URL);
const db = new PrismaClient();

// Deterministic date helpers (no Math.random — keep the demo reproducible).
const now = new Date();
function daysFromNow(n: number): Date {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(12, 0, 0, 0);
  return d;
}

// ── Data ────────────────────────────────────────────────────────────────────

const compensationRoles = [
  { roleId: "TRAINEE" as const, roleName: "Trainee", hourlyRate: 3, minTotalHoursToReachNext: 40, nextRoleId: "TIER_1" as const, canDelegateTasks: false },
  { roleId: "TIER_1" as const, roleName: "Tier 1 VA", hourlyRate: 4, minTotalHoursToReachNext: 360, nextRoleId: "TIER_2" as const, canDelegateTasks: false },
  { roleId: "TIER_2" as const, roleName: "Tier 2 VA", hourlyRate: 5, minTotalHoursToReachNext: 720, nextRoleId: "TIER_3" as const, canDelegateTasks: false },
  { roleId: "TIER_3" as const, roleName: "Senior VA", hourlyRate: 6.5, minTotalHoursToReachNext: 1200, nextRoleId: "TIER_4" as const, canDelegateTasks: true },
  { roleId: "TIER_4" as const, roleName: "Lead VA", hourlyRate: 8, minTotalHoursToReachNext: null, nextRoleId: null, canDelegateTasks: true },
];

// Obviously-fake VAs. Names are generic demo personas; emails @example.com.
const vas = [
  { vaId: "DVA001", name: "Robin Reyes", email: "robin.reyes@example.com", compensationRole: "TIER_3" as const, status: "active" as const, targetHoursWeekly: 40, baselineHours: 1180, supervisorVaId: null },
  { vaId: "DVA002", name: "Sam Cruz", email: "sam.cruz@example.com", compensationRole: "TIER_2" as const, status: "active" as const, targetHoursWeekly: 40, baselineHours: 690, supervisorVaId: "DVA001" },
  { vaId: "DVA003", name: "Alex Dizon", email: "alex.dizon@example.com", compensationRole: "TIER_1" as const, status: "active" as const, targetHoursWeekly: 30, baselineHours: 340, supervisorVaId: "DVA001" },
  { vaId: "DVA004", name: "Jamie Lim", email: "jamie.lim@example.com", compensationRole: "TIER_2" as const, status: "active" as const, targetHoursWeekly: 40, baselineHours: 705, supervisorVaId: "DVA001" },
  { vaId: "DVA005", name: "Casey Tan", email: "casey.tan@example.com", compensationRole: "TRAINEE" as const, status: "training" as const, targetHoursWeekly: 20, baselineHours: 18, supervisorVaId: "DVA002" },
  { vaId: "DVA006", name: "Riley Santos", email: "riley.santos@example.com", compensationRole: "TIER_1" as const, status: "active" as const, targetHoursWeekly: 35, baselineHours: 355, supervisorVaId: "DVA002" },
];

async function main() {
  console.log(`seed-demo: seeding demo database "${dbName}" …`);

  // Wipe (child-first) — safe because we've asserted this is a demo DB.
  // Only clears the tables this seed populates; extend as coverage grows.
  await db.$transaction([
    db.setting.deleteMany({}),
    db.user.deleteMany({}),
    db.compensationRole.deleteMany({}),
  ]);
  // Va has FK dependents seeded later; delete after those in the full seed.
  await db.va.deleteMany({});

  // Settings — email SAFETY (redirect every system email to a demo sink) + a demo flag.
  await db.setting.createMany({
    data: [
      { key: "email_redirect_to", value: "demo-sink@example.com" },
      { key: "email_redirect_to_actor", value: "FALSE" },
      { key: "demo_mode", value: "TRUE" },
    ],
  });

  // Compensation tiers.
  for (const r of compensationRoles) {
    await db.compensationRole.create({
      data: {
        roleId: r.roleId,
        roleName: r.roleName,
        compensationType: "hourly",
        hourlyRate: r.hourlyRate,
        onAdvancementTrack: r.nextRoleId != null,
        minTotalHoursToReachNext: r.minTotalHoursToReachNext,
        nextRoleId: r.nextRoleId,
        canDelegateTasks: r.canDelegateTasks,
        canDelegateProjects: r.canDelegateTasks,
      },
    });
  }

  // VAs (supervisor links resolve because we insert in dependency order).
  for (const v of vas) {
    await db.va.create({
      data: {
        vaId: v.vaId,
        name: v.name,
        email: v.email,
        compensationRole: v.compensationRole,
        status: v.status,
        targetHoursWeekly: v.targetHoursWeekly,
        baselineHours: v.baselineHours,
        supervisorVaId: v.supervisorVaId,
        roleStartedDate: daysFromNow(-120),
      },
    });
  }

  // Logins: a demo HR manager (used via DEV_AUTH_EMAIL to bypass Google login for
  // recording) + a VA login for the "My Console" perspective.
  await db.user.create({
    data: { email: DEMO_HR_EMAIL, name: "Dana Morgan (Demo HR)", role: "HR_MANAGER", isAdmin: true, active: true },
  });
  await db.user.create({
    data: { email: "robin.reyes@example.com", name: "Robin Reyes", role: "SENIOR_VA", active: true, vaId: "DVA001" },
  });

  console.log(`seed-demo: base slice done — ${compensationRoles.length} tiers, ${vas.length} VAs, 2 logins, email redirected to demo-sink@example.com.`);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
