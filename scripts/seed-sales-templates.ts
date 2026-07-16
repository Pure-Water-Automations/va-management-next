// Seed ONLY the 8 sales email templates (real content, not demo data).
// Idempotent: upserts by stable id t1…t8, so re-running refreshes bodies
// without duplicating. Safe on any DB — touches SalesEmailTemplate only.
//
//   npx tsx scripts/seed-sales-templates.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const seed = JSON.parse(readFileSync(join(__dirname, "data", "sales-console-seed.json"), "utf8")) as {
  templates: { id: string; cat: string; title: string; purpose?: string; body: string; sort?: number }[];
};

async function main() {
  for (const [i, t] of seed.templates.entries()) {
    const data = { cat: t.cat, title: t.title, purpose: t.purpose ?? "", body: t.body, sort: t.sort ?? i };
    await db.salesEmailTemplate.upsert({ where: { id: t.id }, update: data, create: { id: t.id, ...data } });
  }
  console.log(`Seeded ${seed.templates.length} email templates.`);
}

main().finally(() => db.$disconnect());
