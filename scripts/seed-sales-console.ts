// Seed the Sales & Marketing console with the design-mock dataset (extracted
// verbatim from the "Sales and Marketing Console" Claude Design export).
// Idempotent: every row upserts by its stable design id (d1…, c1…, tg1…), so
// re-running refreshes the demo data without touching real leads.
//
//   npx tsx scripts/seed-sales-console.ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient, type ClientAgreementStatus } from "@prisma/client";
import { SALES_OWNERS } from "../src/lib/sales/owners";

// GUARD: this injects 13 fake deals into the shared Deal table — the same
// table the real pipeline, mirror-sheet export, and MCP tools read. Only run
// against a sales-console test instance (or force it explicitly).
if (process.env.CONSOLE_MODE !== "sales" && process.env.SEED_SALES_CONSOLE !== "1") {
  console.error(
    "Refusing to seed: this DB is not a sales-console instance (CONSOLE_MODE != 'sales').\n" +
      "If you really want demo deals in this database, re-run with SEED_SALES_CONSOLE=1.",
  );
  process.exit(1);
}

const db = new PrismaClient();

const OWNER_EMAIL: Record<string, string> = Object.fromEntries(
  SALES_OWNERS.map((o) => [o.key, o.email]),
);

const seed = JSON.parse(
  readFileSync(join(__dirname, "data", "sales-console-seed.json"), "utf8"),
);

const YEAR = new Date().getFullYear();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jan 2026" → Date; "Jun 24" → Date in the current year; ISO stays ISO. */
function parseLoose(v: string | null | undefined): Date | null {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(v)) return new Date(v);
  const my = /^([A-Za-z]{3}) (\d{4})$/.exec(v);
  if (my) return new Date(Number(my[2]), MONTHS.indexOf(my[1]), 1);
  const md = /^([A-Za-z]{3}) (\d{1,2})(?:, (.+))?$/.exec(v);
  if (md) {
    const d = new Date(YEAR, MONTHS.indexOf(md[1]), Number(md[2]));
    if (md[3]) {
      const t = /(\d{1,2}):(\d{2}) (AM|PM)/.exec(md[3]);
      if (t) d.setHours((Number(t[1]) % 12) + (t[3] === "PM" ? 12 : 0), Number(t[2]));
    }
    return d;
  }
  return null;
}

async function main() {
  // ── Client accounts (before deals: deals link to them) ────────────────
  for (const c of seed.clients) {
    const data = {
      org: c.org,
      contact: c.contact ?? "",
      email: c.email ?? "",
      pkg: c.pkg,
      price: c.price ?? 0,
      hoursUsed: c.hoursUsed ?? 0,
      since: parseLoose(c.since) ?? new Date(),
      lastTouch: parseLoose(c.lastTouch) ?? new Date(),
      ownerEmail: OWNER_EMAIL[c.owner] ?? c.owner,
      health: c.health,
      checkinDue: !!c.checkinDue,
      testimonial: c.testimonial ?? "none",
      upgradeDealId: c.upgradeDealId ?? null,
      timeline: c.timeline ?? [],
    };
    await db.clientAccount.upsert({ where: { id: c.id }, update: data, create: { id: c.id, ...data } });
  }

  // ── Deals + agreements ─────────────────────────────────────────────────
  for (const d of seed.deals) {
    const data = {
      orgName: d.org,
      contactName: d.contact ?? null,
      contactEmail: d.email ?? null,
      stage: d.stage,
      packageName: d.pkg ?? null,
      dealValue: d.value ?? null,
      billingType: d.billing ?? null,
      accountOwnerEmail: OWNER_EMAIL[d.owner] ?? d.owner,
      source: d.source ?? null,
      leadVerdict: d.verdict ?? null,
      leadScore: d.score ?? null,
      leadSummary: d.summary || null,
      discoveryCallAt: d.callAt ? new Date(d.callAt) : null,
      discoveryCallStatus: d.callStatus ?? null,
      discoveryNotesJson: d.notes ?? undefined,
      upgradeOfAccountId: d.upgrade ? (d.clientId ?? null) : null,
      // The mock's won deal closed on the 1st of the demo month ("onboarding
      // started July 1"), so "won this month" targets stay correct.
      wonAt: d.stage === "won" ? new Date(YEAR, new Date().getMonth(), 1) : null,
      createdAt: new Date(d.created),
    };
    await db.deal.upsert({ where: { id: d.id }, update: data, create: { id: d.id, ...data } });

    if (d.agr) {
      const status = (d.agr.paid ? "paid" : d.agr.signed ? "signed" : d.agr.sent ? "sent" : "draft") as ClientAgreementStatus;
      const agrData = {
        status,
        packageName: d.pkg ?? null,
        priceLabel: d.value ? `$${d.value}${d.billing === "retainer" ? "/mo" : ""}` : null,
        billingType: d.billing ?? null,
        sentAt: d.agr.sent ? new Date() : null,
        signedAt: d.agr.signed ? new Date() : null,
        paidAt: d.agr.paid ? new Date() : null,
      };
      await db.clientAgreement.upsert({
        where: { dealId: d.id },
        update: agrData,
        create: { deal: { connect: { id: d.id } }, signToken: `seed-${d.id}`, ...agrData },
      });
    }
  }

  // ── Follow-ups ─────────────────────────────────────────────────────────
  for (const f of seed.followups) {
    const data = {
      due: new Date(f.due),
      title: f.title,
      detail: f.detail ?? "",
      kind: f.kind,
      refType: f.refType ?? null,
      refId: f.refId ?? null,
    };
    await db.salesFollowUp.upsert({ where: { id: f.id }, update: data, create: { id: f.id, ...data } });
  }

  // ── Email templates ────────────────────────────────────────────────────
  let i = 0;
  for (const t of seed.templates) {
    const data = { cat: t.cat, title: t.title, purpose: t.purpose ?? "", body: t.body ?? "", sort: i++ };
    await db.salesEmailTemplate.upsert({ where: { id: t.id }, update: data, create: { id: t.id, ...data } });
  }

  // ── Goals & targets ────────────────────────────────────────────────────
  for (const g of seed.goals) {
    const data = {
      title: g.title,
      ownerEmail: OWNER_EMAIL[g.owner] ?? g.owner,
      due: g.due ?? "",
      status: g.status,
      krs: g.krs ?? [],
    };
    await db.salesGoal.upsert({ where: { id: g.id }, update: data, create: { id: g.id, ...data } });
  }
  let ts = 0;
  for (const t of seed.targets) {
    const data = { grp: t.group, label: t.label, hint: t.hint ?? "", unit: t.unit ?? "#", kind: t.kind, target: t.target, sort: ts++ };
    await db.salesTarget.upsert({ where: { id: t.id }, update: data, create: { id: t.id, ...data } });
  }

  // ── Marketing ──────────────────────────────────────────────────────────
  for (const c of seed.campaigns) {
    const data = { name: c.name, channel: c.channel, status: c.status, dates: c.dates ?? "", tag: c.tag, descr: c.desc ?? "" };
    await db.marketingCampaign.upsert({ where: { id: c.id }, update: data, create: { id: c.id, ...data } });
  }
  const month = new Date().getMonth();
  for (const c of seed.content) {
    const data = {
      date: new Date(YEAR, month, c.day),
      title: c.title,
      type: c.type,
      status: c.status,
      notes: c.notes ?? "",
    };
    await db.contentItem.upsert({ where: { id: c.id }, update: data, create: { id: c.id, ...data } });
  }
  for (const s of seed.socials) {
    const data = {
      platform: s.platform,
      text: s.text,
      scheduledAt: parseLoose(s.when),
      status: s.status,
      metrics: s.metrics ?? "",
    };
    await db.socialPost.upsert({ where: { id: s.id }, update: data, create: { id: s.id, ...data } });
  }
  for (const q of seed.sequences) {
    const data = {
      name: q.name,
      descr: q.desc ?? "",
      status: q.status,
      audienceKind: q.audienceKind,
      steps: q.steps ?? [],
      next: q.next ?? "",
    };
    await db.emailSequence.upsert({ where: { id: q.id }, update: data, create: { id: q.id, ...data } });
  }
  for (const t of seed.testimonials) {
    const data = { org: t.org, who: t.who ?? "", stage: t.stage, quote: t.quote ?? "", detail: t.detail ?? "" };
    await db.marketingTestimonial.upsert({ where: { id: t.id }, update: data, create: { id: t.id, ...data } });
  }
  for (const r of seed.referrers) {
    const data = {
      name: r.name,
      kind: r.kind,
      sent: r.sent ?? 0,
      leads: r.leads ?? 0,
      won: r.won ?? 0,
      lastAt: parseLoose(r.last),
      note: r.note ?? "",
    };
    await db.referrer.upsert({ where: { id: r.id }, update: data, create: { id: r.id, ...data } });
  }

  console.log("Sales & Marketing console seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
