/**
 * Seed a few realistic SAMPLE projects + tasks for the test round. Idempotent:
 * skips a project/task whose exact name already exists. All names are prefixed
 * "[SAMPLE]" so they're easy to spot and delete later.
 *
 * Run on the VPS with prod env:
 *   set -a && . ../shared/.env.production && set +a && npx tsx scripts/seed-sample-projects.ts
 */
import { db } from "@/lib/db";

async function uid(email: string): Promise<string> {
  const u = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (!u) throw new Error(`No user for ${email}`);
  return u.id;
}
function days(n: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function main() {
  const aira = await uid("aira.purewaterautomations@gmail.com");
  const justin = await uid("okamotomiak@gmail.com");
  const kanna = await uid("kannava.purewaterautomations@gmail.com");
  const marc = await uid("marc.purewaterautomations@gmail.com");
  const suji = await uid("suji.purewaterautomations@gmail.com");
  const akane = await uid("akane.purewaterautomations@gmail.com");
  const jane = await uid("jane.purewaterautomations@gmail.com");
  const ayug = await uid("ayug.purewaterautomations@gmail.com");

  const projects = [
    {
      name: "[SAMPLE] Client Onboarding — Acme Co",
      description: "Stand up a new client: kickoff, asset collection, workspace setup, first deliverable.",
      status: "Active", type: "Project", priority: "High", client: "Acme Co",
      tasks: [
        { title: "Send welcome packet + schedule kickoff", strategy: "Communicate", priority: "High", status: "Done", to: suji, due: days(-5) },
        { title: "Collect brand assets & logins", strategy: "Research", priority: "Medium", status: "InProgress", to: kanna, due: days(2) },
        { title: "Set up project workspace + folders", strategy: "Create", priority: "Medium", status: "NotStarted", to: akane, due: days(4) },
        { title: "Draft first monthly report template", strategy: "Create", priority: "Low", status: "NotStarted", to: jane, due: days(12) },
      ],
    },
    {
      name: "[SAMPLE] Q3 Social Content Calendar",
      description: "Plan, design, and schedule Q3 content across channels.",
      status: "Active", type: "Recurring", priority: "Medium", client: "Pure Water",
      tasks: [
        { title: "Build content themes for July", strategy: "Plan", priority: "Medium", status: "InProgress", to: marc, due: days(-1) },
        { title: "Design 10 post graphics in Canva", strategy: "Create", priority: "High", status: "NotStarted", to: akane, due: days(6) },
        { title: "Schedule posts in the scheduler", strategy: "Automate", priority: "Low", status: "Blocked", to: ayug, due: days(9) },
      ],
    },
    {
      name: "[SAMPLE] Website Revamp",
      description: "Refresh the marketing site — copy, design, and a few new pages.",
      status: "Planning", type: "Project", priority: "Medium", client: "Pure Water",
      tasks: [
        { title: "Audit current site + list pages to update", strategy: "Research", priority: "Medium", status: "NotStarted", to: kanna, due: days(3) },
        { title: "Write new homepage copy", strategy: "Create", priority: "Medium", status: "NotStarted", to: jane, due: days(14) },
      ],
    },
  ];

  for (const p of projects) {
    if (await db.project.findFirst({ where: { name: p.name }, select: { id: true } })) {
      console.log(`SKIP project: ${p.name}`);
      continue;
    }
    const proj = await db.project.create({
      data: {
        name: p.name, description: p.description, status: p.status as never, type: p.type as never,
        priority: p.priority as never, client: p.client, ownerId: aira, createdById: justin,
      },
    });
    for (const t of p.tasks) {
      await db.task.create({
        data: {
          title: t.title, strategy: t.strategy as never, priority: t.priority as never, status: t.status as never,
          client: p.client, projectId: proj.id, assignedToId: t.to, assignedById: aira, dueDate: t.due,
        },
      });
    }
    console.log(`CREATED project: ${p.name} (+${p.tasks.length} tasks)`);
  }

  const standalone = [
    { title: "[SAMPLE] Reconcile June client invoices", strategy: "Fix", priority: "High", status: "NotStarted", to: suji, due: days(1), client: "Acme Co" },
    { title: "[SAMPLE] Research a new scheduling tool", strategy: "Research", priority: "Low", status: "InProgress", to: marc, due: days(20), client: null },
  ];
  for (const t of standalone) {
    if (await db.task.findFirst({ where: { title: t.title }, select: { id: true } })) {
      console.log(`SKIP task: ${t.title}`);
      continue;
    }
    await db.task.create({
      data: {
        title: t.title, strategy: t.strategy as never, priority: t.priority as never, status: t.status as never,
        client: t.client, assignedToId: t.to, assignedById: aira, dueDate: t.due,
      },
    });
    console.log(`CREATED standalone task: ${t.title}`);
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
