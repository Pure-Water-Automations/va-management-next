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
import { PrismaClient, type Prisma } from "@prisma/client";

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
  // A few more for a fuller roster.
  { vaId: "DVA007", name: "Morgan Perez", email: "morgan.perez@example.com", compensationRole: "TIER_2" as const, status: "active" as const, targetHoursWeekly: 40, baselineHours: 660, supervisorVaId: "DVA001" },
  { vaId: "DVA008", name: "Jordan Bautista", email: "jordan.bautista@example.com", compensationRole: "TIER_1" as const, status: "active" as const, targetHoursWeekly: 30, baselineHours: 300, supervisorVaId: "DVA002" },
  { vaId: "DVA009", name: "Taylor Aquino", email: "taylor.aquino@example.com", compensationRole: "TRAINEE" as const, status: "training" as const, targetHoursWeekly: 20, baselineHours: 8, supervisorVaId: "DVA001" },
];

const HR_RATE: Record<string, number> = {
  TRAINEE: 3, TIER_1: 4, TIER_2: 5, TIER_3: 6.5, TIER_4: 8,
};

async function main() {
  console.log(`seed-demo: seeding demo database "${dbName}" …`);

  // Wipe (child-first, correct FK order) — safe because we've asserted this is a
  // demo DB. Children before parents so a re-run is idempotent.
  await db.$transaction([
    // Recruitment / training children first.
    db.trainingTaskProgress.deleteMany({}),
    db.trainingSession.deleteMany({}),
    db.candidate.deleteMany({}),
    // Client portal children.
    db.clientTaskRequest.deleteMany({}),
    db.deal.deleteMany({}),
    db.clientMembership.deleteMany({}),
    db.clientAssignment.deleteMany({}),
    db.clientOrganization.deleteMany({}),
    // HR children that reference Va / each other.
    db.evaluation.deleteMany({}), // FK → tierReview + va
    db.tierReview.deleteMany({}),
    db.payrollCalculation.deleteMany({}),
    db.payrollPeriod.deleteMany({}),
    db.capacityFlagEvent.deleteMany({}),
    db.deskLogEfficiency.deleteMany({}),
    db.deskLogHours.deleteMany({}),
    db.onboarding.deleteMany({}),
    db.activityLog.deleteMany({}),
    db.notification.deleteMany({}),
    db.projectComment.deleteMany({}),
    db.task.deleteMany({}), // must precede User/Project (assignedToId/projectId FKs)
    db.project.deleteMany({}), // must precede User (ownerId/createdById FKs)
    // Base tables.
    db.setting.deleteMany({}),
    db.user.deleteMany({}),
    db.compensationRole.deleteMany({}),
  ]);
  // Va has FK dependents (deleted above); safe to clear now.
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
  // recording) + VA logins for the "My Console" perspective. Casey Tan (TRAINEE,
  // low baseline hours) is the "new VA just joining" persona — a plain VA role
  // (not SENIOR_VA) so the nav matches what a brand-new hire actually sees (no
  // delegation/All Tasks/Projects items).
  const hrUser = await db.user.create({
    data: { email: DEMO_HR_EMAIL, name: "Dana Morgan (Demo HR)", role: "HR_MANAGER", isAdmin: true, active: true },
  });
  const robinUser = await db.user.create({
    data: { email: "robin.reyes@example.com", name: "Robin Reyes", role: "SENIOR_VA", active: true, vaId: "DVA001" },
  });
  const caseyUser = await db.user.create({
    data: { email: "casey.tan@example.com", name: "Casey Tan", role: "VA", active: true, vaId: "DVA005" },
  });
  // Non-admin logins for role-specific tutorials (isAdmin:false so nav gating is
  // accurate — an admin login bypasses role checks and would show every section
  // regardless of role, which is NOT what a real HR_MANAGER/TEAM_LEAD/RECRUITER/
  // BOOKKEEPER teammate sees).
  await db.user.create({
    data: { email: "hr.manager@example.com", name: "Morgan Reyes", role: "HR_MANAGER", isAdmin: false, active: true },
  });
  await db.user.create({
    data: { email: "team.lead@example.com", name: "Jordan Silva", role: "TEAM_LEAD", isAdmin: false, active: true },
  });
  await db.user.create({
    data: { email: "recruiter@example.com", name: "Avery Chen", role: "RECRUITER", isAdmin: false, active: true },
  });
  await db.user.create({
    data: { email: "bookkeeper@example.com", name: "Sam Okafor", role: "BOOKKEEPER", isAdmin: false, active: true },
  });

  const activeVaIds = vas.filter((v) => v.status === "active" || v.status === "training").map((v) => v.vaId);
  const vaByIdName = new Map(vas.map((v) => [v.vaId, v.name] as const));

  // ── Tasks (My Tasks for Casey + the Available claim pool) ──────────────────
  // Casey's plate: one done (history), one due TODAY, two upcoming — populates
  // the Overview hero + My Tasks without looking overdue/overwhelming for a
  // just-joined VA. Strategy/priority vary so the badges look real.
  await db.task.create({
    data: {
      title: "Welcome check-in with your supervisor", strategy: "Communicate", priority: "Medium",
      status: "Done", assignedToId: caseyUser.id, assignedById: hrUser.id, dueDate: daysFromNow(-6),
      instructions: "30-min intro call with Sam Cruz to walk through your first two weeks.",
    },
  });
  await db.task.create({
    data: {
      title: "Update your profile photo & bio", strategy: "Create", priority: "Medium",
      status: "NotStarted", assignedToId: caseyUser.id, assignedById: hrUser.id, dueDate: daysFromNow(0),
      instructions: "Add a headshot and a two-line bio so the team recognizes you in Slack/WhatsApp.",
    },
  });
  await db.task.create({
    data: {
      title: "Complete Module 2: Client Communication Basics", strategy: "Research", priority: "Medium",
      status: "InProgress", assignedToId: caseyUser.id, assignedById: hrUser.id, dueDate: daysFromNow(3),
      instructions: "PWA Academy — finish the module quiz before your next check-in.",
    },
  });
  await db.task.create({
    data: {
      title: "Shadow a client call recap", strategy: "Plan", priority: "Low",
      status: "NotStarted", assignedToId: caseyUser.id, assignedById: hrUser.id, dueDate: daysFromNow(6),
      instructions: "Sit in on Sam's Friday client recap to see how deliverables get summarized.",
    },
  });
  // Open pool (claimable): non-urgent work anyone can pick up. Held by their
  // creator (hrUser) until claimed, per the claimable-task contract.
  await db.task.createMany({
    data: [
      { title: "Proofread the onboarding welcome email template", strategy: "Fix", priority: "Low", claimable: true, assignedToId: hrUser.id, assignedById: hrUser.id, dueDate: daysFromNow(5) },
      { title: "Tag stock photos for the knowledge base", strategy: "Simplify", priority: "Low", claimable: true, assignedToId: hrUser.id, assignedById: hrUser.id, dueDate: daysFromNow(8) },
    ],
  });

  // ── Projects (for the HR Manager / Team Lead Projects + Workload views) ─────
  const websiteProject = await db.project.create({
    data: {
      name: "Client Onboarding Refresh", description: "Streamline the intake-to-kickoff flow for new clients.",
      status: "Active", type: "Project", priority: "High", ownerId: hrUser.id, createdById: hrUser.id,
      dueDate: daysFromNow(21),
    },
  });
  await db.project.create({
    data: {
      name: "Q3 Team Training Refresh", description: "Refresh the PWA Academy modules for Q3.",
      status: "Planning", type: "Project", priority: "Medium", ownerId: hrUser.id, createdById: hrUser.id,
      dueDate: daysFromNow(35),
    },
  });
  // A couple of team tasks under the project (distinct from Casey's My-Tasks set).
  await db.task.createMany({
    data: [
      { title: "Draft the new intake questionnaire", strategy: "Create", priority: "High", status: "InProgress", assignedToId: robinUser.id, assignedById: hrUser.id, projectId: websiteProject.id, dueDate: daysFromNow(4) },
      { title: "Review kickoff-call script", strategy: "Research", priority: "Medium", status: "NotStarted", assignedToId: robinUser.id, assignedById: hrUser.id, projectId: websiteProject.id, dueDate: daysFromNow(9) },
    ],
  });

  // ── Notifications (the bell in the top nav) ─────────────────────────────────
  await db.notification.createMany({
    data: [
      { userId: caseyUser.id, type: "task_assigned", body: "You were assigned: Update your profile photo & bio", link: "/va/tasks", read: false, createdAt: daysFromNow(0) },
      { userId: caseyUser.id, type: "task_assigned", body: "You were assigned: Complete Module 2: Client Communication Basics", link: "/va/tasks", read: false, createdAt: daysFromNow(-1) },
      { userId: caseyUser.id, type: "reminder", body: "Your monthly check-in is ready whenever you are.", link: "/va/checkin", read: true, createdAt: daysFromNow(-3) },
    ],
  });

  // ── DeskLog hours + efficiency ─────────────────────────────────────────────
  // Realistic daily hours over the last ~16 days so 14-day utilization + efficiency
  // render. We shape per-VA totals so one VA is over-capacity and one under.
  // 14-day expected = targetHoursWeekly * 2. utilizationPct = task14 / expected * 100.
  // over: util > 120% ; under: util < 50%.
  const hourProfiles: Record<string, { taskPerDay: number; atWorkPerDay: number; activityPct: number }> = {
    DVA001: { taskPerDay: 5.0, atWorkPerDay: 6.0, activityPct: 82 }, // over-capacity (util ~125%)
    DVA002: { taskPerDay: 3.0, atWorkPerDay: 4.2, activityPct: 61 },
    DVA003: { taskPerDay: 1.0, atWorkPerDay: 2.4, activityPct: 33 }, // under-utilized (util ~47%) + low efficiency
    DVA004: { taskPerDay: 2.8, atWorkPerDay: 3.6, activityPct: 68 },
    DVA005: { taskPerDay: 1.2, atWorkPerDay: 1.8, activityPct: 55 },
    DVA006: { taskPerDay: 2.4, atWorkPerDay: 3.1, activityPct: 71 },
    DVA007: { taskPerDay: 2.9, atWorkPerDay: 3.8, activityPct: 74 },
    DVA008: { taskPerDay: 1.9, atWorkPerDay: 2.6, activityPct: 22 }, // low efficiency (RED)
    DVA009: { taskPerDay: 0.9, atWorkPerDay: 1.5, activityPct: 48 },
  };
  const hoursRows: Prisma.DeskLogHoursCreateManyInput[] = [];
  const effRows: Prisma.DeskLogEfficiencyCreateManyInput[] = [];
  for (const vaId of activeVaIds) {
    const p = hourProfiles[vaId] ?? { taskPerDay: 2, atWorkPerDay: 3, activityPct: 60 };
    for (let d = 1; d <= 16; d++) {
      const day = daysFromNow(-d);
      // Skip weekends (roughly) so the data looks human.
      if (day.getUTCDay() === 0 || day.getUTCDay() === 6) continue;
      hoursRows.push({
        date: day,
        vaId,
        project: "Client work",
        task: "Assigned tasks",
        billable: true,
        timeAtWorkHrs: p.atWorkPerDay,
        focusTimeHrs: Math.round(p.taskPerDay * 0.8 * 10) / 10,
        idleTimeHrs: Math.round((p.atWorkPerDay - p.taskPerDay) * 10) / 10,
        taskSpentHrs: p.taskPerDay,
        taskAssignedHrs: p.taskPerDay + 0.5,
        payRule: "standard",
      });
      effRows.push({
        date: day,
        vaId,
        activityPct: p.activityPct,
        efficiencyPct: p.activityPct,
        productiveTimeHrs: p.taskPerDay,
        focusTimeHrs: Math.round(p.taskPerDay * 0.8 * 10) / 10,
        idleTimeHrs: Math.round((p.atWorkPerDay - p.taskPerDay) * 10) / 10,
        nonProductiveTimeHrs: Math.round((p.atWorkPerDay - p.taskPerDay) * 10) / 10,
      });
    }
  }
  await db.deskLogHours.createMany({ data: hoursRows });
  await db.deskLogEfficiency.createMany({ data: effRows });

  // Set last check-in dates so "check-ins this month" is non-zero.
  for (const vaId of ["DVA001", "DVA002", "DVA004", "DVA006", "DVA007"]) {
    await db.va.update({ where: { vaId }, data: { lastCheckinDate: daysFromNow(-5) } });
  }

  // ── Capacity flag events ───────────────────────────────────────────────────
  await db.capacityFlagEvent.createMany({
    data: [
      { vaId: "DVA001", vaName: "Robin Reyes", flagType: "overburdened", transition: "flagged", severity: "red", supervisorVaId: null, notes: "Sustained >120% utilization over the last two weeks.", timestamp: daysFromNow(-2) },
      { vaId: "DVA003", vaName: "Alex Dizon", flagType: "underutilized", transition: "flagged", severity: "yellow", supervisorVaId: "DVA001", notes: "Logged well under target — check for blockers or availability change.", timestamp: daysFromNow(-3) },
      { vaId: "DVA008", vaName: "Jordan Bautista", flagType: "manual_review", transition: "reviewed", severity: "yellow", supervisorVaId: "DVA002", notes: "Low activity percentage flagged for supervisor review.", timestamp: daysFromNow(-4) },
    ],
  });

  // ── Payroll ────────────────────────────────────────────────────────────────
  // One OPEN current period + two past closed periods (Archive view).
  const openStart = daysFromNow(-6);
  const openEnd = daysFromNow(7);
  const openClose = daysFromNow(9);
  await db.payrollPeriod.create({
    data: { periodStart: openStart, periodEnd: openEnd, closeDate: openClose, status: "open" },
  });
  let openTotalHours = 0;
  let openTotalPay = 0;
  for (const v of vas.filter((x) => x.status === "active" || x.status === "training")) {
    const rate = HR_RATE[v.compensationRole];
    const hours = v.status === "training" ? 24 : v.compensationRole === "TIER_3" ? 70 : 60;
    const gross = Math.round(hours * rate * 100) / 100;
    openTotalHours += hours;
    openTotalPay += gross;
    await db.payrollCalculation.create({
      data: {
        periodStart: openStart, periodEnd: openEnd, vaId: v.vaId, name: v.name,
        compensationRole: v.compensationRole, compensationType: "hourly",
        hoursInPeriod: hours, hourlyRate: rate, grossPay: gross,
      },
    });
  }
  await db.payrollPeriod.update({
    where: { periodStart: openStart },
    data: { periodTotalHours: openTotalHours, periodTotalPayroll: Math.round(openTotalPay * 100) / 100 },
  });

  // Two past closed periods (each two weeks back).
  for (let i = 1; i <= 2; i++) {
    const pStart = daysFromNow(-6 - 14 * i);
    const pEnd = daysFromNow(7 - 14 * i);
    const pClose = daysFromNow(9 - 14 * i);
    let th = 0;
    let tp = 0;
    await db.payrollPeriod.create({
      data: { periodStart: pStart, periodEnd: pEnd, closeDate: pClose, status: i === 1 ? "closed" : "paid" },
    });
    for (const v of vas.filter((x) => x.status === "active")) {
      const rate = HR_RATE[v.compensationRole];
      const hours = v.compensationRole === "TIER_3" ? 72 : 62;
      const gross = Math.round(hours * rate * 100) / 100;
      th += hours;
      tp += gross;
      await db.payrollCalculation.create({
        data: {
          periodStart: pStart, periodEnd: pEnd, vaId: v.vaId, name: v.name,
          compensationRole: v.compensationRole, compensationType: "hourly",
          hoursInPeriod: hours, hourlyRate: rate, grossPay: gross,
        },
      });
    }
    await db.payrollPeriod.update({
      where: { periodStart: pStart },
      data: { periodTotalHours: th, periodTotalPayroll: Math.round(tp * 100) / 100 },
    });
  }

  // ── Tier reviews (pending) ─────────────────────────────────────────────────
  // VAs who've hit their next-tier hours. Two pending + one approved (rate-change feed).
  const tr1 = await db.tierReview.create({
    data: {
      vaId: "DVA002", vaName: "Sam Cruz", currentRole: "TIER_2", targetRole: "TIER_3",
      cumulativeHoursAtTrigger: 728, status: "hours_triggered", timestamp: daysFromNow(-8),
    },
  });
  const tr2 = await db.tierReview.create({
    data: {
      vaId: "DVA003", vaName: "Alex Dizon", currentRole: "TIER_1", targetRole: "TIER_2",
      cumulativeHoursAtTrigger: 372, status: "under_review", timestamp: daysFromNow(-4),
      skillAttestationFormUrl: "https://example.com/forms/attestation/DVA003",
    },
  });
  const tr3 = await db.tierReview.create({
    data: {
      vaId: "DVA005", vaName: "Casey Tan", currentRole: "TRAINEE", targetRole: "TIER_1",
      cumulativeHoursAtTrigger: 42, status: "form_sent", timestamp: daysFromNow(-2),
    },
  });
  // One approved (drives payroll "rate changes" feed).
  await db.tierReview.create({
    data: {
      vaId: "DVA006", vaName: "Riley Santos", currentRole: "TIER_1", targetRole: "TIER_2",
      cumulativeHoursAtTrigger: 365, status: "approved", timestamp: daysFromNow(-20),
      hrDecisionDate: daysFromNow(-18), hrNotes: "Consistently strong output; promoted.",
    },
  });

  // ── Evaluations (various statuses; 1:1 with a TierReview) ───────────────────
  // Give the two pending tier reviews their evaluation rows.
  await db.evaluation.create({
    data: {
      tierReviewId: tr1.id, vaId: "DVA002", vaName: "Sam Cruz", rubric: "TIER", stage: "tier_2_3",
      status: "ready_for_review", supervisorVaId: "DVA001",
      selfSubmittedAt: daysFromNow(-7), selfScore: 4.2,
      supervisorSubmittedAt: daysFromNow(-6), supervisorScore: 4.0, supervisorRecommendation: "promote",
      combinedScore: 4.1, autoRecommendation: "promote",
    },
  });
  await db.evaluation.create({
    data: {
      tierReviewId: tr2.id, vaId: "DVA003", vaName: "Alex Dizon", rubric: "TIER", stage: "tier_1_2",
      status: "supervisor_submitted", supervisorVaId: "DVA001",
      selfSubmittedAt: daysFromNow(-4), selfScore: 3.6,
      supervisorSubmittedAt: daysFromNow(-3), supervisorScore: 3.8, supervisorRecommendation: "hold",
      combinedScore: 3.7, autoRecommendation: "hold",
    },
  });
  // Left genuinely PENDING (selfSubmittedAt: null) — this is the new-VA tutorial's
  // "here's what completing your first evaluation looks like" beat.
  await db.evaluation.create({
    data: {
      tierReviewId: tr3.id, vaId: "DVA005", vaName: "Casey Tan", rubric: "TRAINEE", stage: "40h",
      status: "forms_sent", supervisorVaId: "DVA002",
    },
  });

  // ── Client organizations + deals ───────────────────────────────────────────
  const acme = await db.clientOrganization.create({
    data: { name: "Acme Widgets", slug: "acme-widgets", status: "active", active: true },
  });
  const northwind = await db.clientOrganization.create({
    data: { name: "Northwind Traders", slug: "northwind-traders", status: "active", active: true },
  });
  await db.deal.create({
    data: {
      orgName: "Globex Consulting", contactName: "Pat Nguyen", contactEmail: "pat.nguyen@example.com",
      source: "Referral", stage: "proposal_sent", teamSize: "10–50", hoursPerWeek: "10–20",
      budgetAvailable: "yes", timeline: "This month", fitVerdict: "hot",
      leadVerdict: "hot", leadScore: 88, leadSummary: "Clear need, budget confirmed, fast timeline.",
    },
  });
  await db.deal.create({
    data: {
      orgName: "Initech LLC", contactName: "Sam Rivera", contactEmail: "sam.rivera@example.com",
      source: "Website", stage: "discovery_scheduled", teamSize: "Under 10", hoursPerWeek: "5–10",
      budgetAvailable: "unsure", timeline: "Next quarter", fitVerdict: "warm",
      leadVerdict: "warm", leadScore: 64, leadSummary: "Interested but budget not yet confirmed.",
    },
  });

  // Client-portal logins that submit task requests.
  const acmeUser = await db.user.create({
    data: { email: "client.acme@example.com", name: "Casey Client (Acme)", role: "CLIENT_ADMIN", active: true },
  });
  const nwUser = await db.user.create({
    data: { email: "client.northwind@example.com", name: "Devon Client (Northwind)", role: "CLIENT_ADMIN", active: true },
  });

  // ── Client task requests (feed the HR decision queue) ──────────────────────
  await db.clientTaskRequest.createMany({
    data: [
      { title: "Format monthly sales report", description: "Clean up and format the July sales spreadsheet for the board deck.", priorityPreference: "High", status: "RECEIVED", submittedById: acmeUser.id, clientOrganizationId: acme.id, createdAt: daysFromNow(-1) },
      { title: "Research 20 podcast guests", description: "Build a shortlist of potential podcast guests in the fintech space.", priorityPreference: "Medium", status: "TRIAGE_NEEDED", submittedById: acmeUser.id, clientOrganizationId: acme.id, createdAt: daysFromNow(-2) },
      { title: "Update CRM contact records", description: "Merge duplicate contacts and fill in missing company fields.", priorityPreference: "Low", status: "READY_TO_ASSIGN", submittedById: nwUser.id, clientOrganizationId: northwind.id, createdAt: daysFromNow(-3) },
    ],
  });

  // ── Recruitment candidates (spread across stages) ──────────────────────────
  await db.candidate.createMany({
    data: [
      { name: "Avery Cruz", email: "avery.cruz@example.com", country: "Philippines", source: "Referral", currentStage: "applied", skillsRoleTags: "Admin, Research", screenVerdict: "serious", screenScore: 78, screenSummary: "Strong admin background, clear answers.", createdAt: daysFromNow(-1) },
      { name: "Blake Ramos", email: "blake.ramos@example.com", country: "Philippines", source: "Facebook", currentStage: "reviewed", skillsRoleTags: "Design, Social Media", screenVerdict: "serious", screenScore: 71, aiSkillScore: 3.8, createdAt: daysFromNow(-3) },
      { name: "Cameron Diaz", email: "cameron.diaz@example.com", country: "Philippines", source: "Website", currentStage: "interview_scheduled", skillsRoleTags: "Customer Support", interviewerEmail: DEMO_HR_EMAIL, interviewDate: daysFromNow(2), screenScore: 82, createdAt: daysFromNow(-5) },
      { name: "Drew Villanueva", email: "drew.villanueva@example.com", country: "Philippines", source: "Referral", currentStage: "interviewed", skillsRoleTags: "Data Entry, Research", recruiterRecommendation: "recommend_hire", commScore: 4.1, reliabilityScore: 4.3, createdAt: daysFromNow(-7) },
      { name: "Emery Gonzales", email: "emery.gonzales@example.com", country: "Philippines", source: "Website", currentStage: "tenhr_invited", skillsRoleTags: "Marketing", finalDecision: "invite_tenhr", decidedBy: DEMO_HR_EMAIL, decidedAt: daysFromNow(-4), tenhrAssignmentTitle: "10-hour trial module", tenhrDeadline: daysFromNow(3), createdAt: daysFromNow(-8) },
      { name: "Finley Torres", email: "finley.torres@example.com", country: "Philippines", source: "Referral", currentStage: "tenhr_in_progress", skillsRoleTags: "Admin", tenhrAssignmentTitle: "10-hour trial module", trainingTotalMinutes: 320, trainingSessionCount: 4, trainingLastSessionAt: daysFromNow(-1), createdAt: daysFromNow(-10) },
      { name: "Gray Mendoza", email: "gray.mendoza@example.com", country: "Philippines", source: "Website", currentStage: "contract_sent", skillsRoleTags: "Research, Design", contractStatus: "sent", contractSentAt: daysFromNow(-2), contractDeadline: daysFromNow(5), tenhrGateResult: "pass", createdAt: daysFromNow(-14) },
      { name: "Harper Reyes", email: "harper.reyes@example.com", country: "Philippines", source: "Referral", currentStage: "signed", skillsRoleTags: "Admin, Support", contractStatus: "signed", signedAt: daysFromNow(-1), tenhrGateResult: "pass", createdAt: daysFromNow(-16) },
    ],
  });

  // ── Onboarding (a couple in progress) ──────────────────────────────────────
  // Attach to existing training VAs so the required Va relation resolves.
  await db.onboarding.createMany({
    data: [
      { vaId: "DVA005", vaName: "Casey Tan", status: "in_progress", signedAt: daysFromNow(-9), gmailCreated: true, desklogCreated: true, whatsappAdded: true, contractUploaded: true, ndaUploaded: false, taxFormType: "W-8BEN", taxFormDone: false, paymentMethod: "Wise", paymentFormDone: true, headshotUploaded: false, handbookAck: false },
      { vaId: "DVA009", vaName: "Taylor Aquino", status: "pending", signedAt: daysFromNow(-2), gmailCreated: true, desklogCreated: false, whatsappAdded: false, contractUploaded: true, ndaUploaded: false, taxFormDone: false, paymentFormDone: false, headshotUploaded: false, handbookAck: false },
    ],
  });

  // ── Activity log (recent-activity feed) ────────────────────────────────────
  await db.activityLog.createMany({
    data: [
      { source: "recruitment", eventType: "candidate_advanced", vaId: null, severity: "info", summary: "Emery Gonzales invited to the 10-hour trial.", timestamp: daysFromNow(-4) },
      { source: "hr", eventType: "tier_review_triggered", vaId: "DVA002", severity: "info", summary: "Sam Cruz reached 728h — tier review triggered.", timestamp: daysFromNow(-8) },
      { source: "capacity", eventType: "flag_raised", vaId: "DVA001", severity: "warning", summary: "Robin Reyes flagged over-capacity (125% utilization).", timestamp: daysFromNow(-2) },
      { source: "payroll", eventType: "period_opened", vaId: null, severity: "info", summary: "New payroll period opened.", timestamp: daysFromNow(-6) },
      { source: "onboarding", eventType: "onboarding_started", vaId: "DVA009", severity: "info", summary: "Taylor Aquino began onboarding.", timestamp: daysFromNow(-2) },
      { source: "client", eventType: "task_request_received", vaId: null, severity: "info", summary: "New task request from Acme Widgets: Format monthly sales report.", timestamp: daysFromNow(-1) },
      { source: "hr", eventType: "tier_review_approved", vaId: "DVA006", severity: "info", summary: "Riley Santos promoted to Tier 2.", timestamp: daysFromNow(-18) },
    ],
  });

  console.log(
    `seed-demo: full slice done — ${compensationRoles.length} tiers, ${vas.length} VAs, ` +
      `${hoursRows.length} desklog-hour rows, payroll (1 open + 2 past), 4 tier reviews, ` +
      `3 evaluations, 3 capacity flags, 8 candidates, 2 onboarding, 2 client orgs, 2 deals, ` +
      `3 client task requests, 7 activity-log rows, 8 tasks (4 Casey + 2 pool + 2 project), ` +
      `2 projects, 3 notifications, 4 role logins (HR/Team Lead/Recruiter/Bookkeeper). ` +
      `Email redirected to demo-sink@example.com.`,
  );
  void vaByIdName;
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
