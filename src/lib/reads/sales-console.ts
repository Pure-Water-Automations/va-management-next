import { db } from "@/lib/db";

// Server read helpers for the Sales console screens (Follow-ups, Client
// Accounts, Email Templates). Plain serializable rows for client components.

export type FollowUpRow = {
  id: string;
  due: string; // ISO datetime
  title: string;
  detail: string;
  kind: string; // call | email | check-in | proposal | payment
  refType: string | null; // "deal" | "client"
  refId: string | null;
};

export type TimelineEntry = { date: string; type: string; note: string };

export type ClientAccountRow = {
  id: string;
  org: string;
  contact: string;
  email: string;
  pkg: string;
  price: number;
  hoursUsed: number;
  since: string; // ISO datetime
  lastTouch: string; // ISO datetime
  ownerEmail: string;
  health: string; // good | growing | watch | new
  checkinDue: boolean;
  testimonial: string; // none | torequest | requested | received | published
  upgradeDealId: string | null;
  timeline: TimelineEntry[];
};

export type EmailTemplateRow = {
  id: string;
  cat: string; // discovery | proposal | payment | checkin | upgrade | reengage | testimonial | referral
  title: string;
  purpose: string;
  body: string;
};

/** Open (not-done) follow-ups, soonest first. */
export async function loadFollowUps(): Promise<FollowUpRow[]> {
  const rows = await db.salesFollowUp.findMany({ where: { doneAt: null }, orderBy: { due: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    due: r.due.toISOString(),
    title: r.title,
    detail: r.detail,
    kind: r.kind,
    refType: r.refType,
    refId: r.refId,
  }));
}

/** Every client account, alphabetical. */
export async function loadClientAccounts(): Promise<ClientAccountRow[]> {
  const rows = await db.clientAccount.findMany({ orderBy: { org: "asc" } });
  return rows.map((r) => ({
    id: r.id,
    org: r.org,
    contact: r.contact,
    email: r.email,
    pkg: r.pkg,
    price: r.price,
    hoursUsed: r.hoursUsed,
    since: r.since.toISOString(),
    lastTouch: r.lastTouch.toISOString(),
    ownerEmail: r.ownerEmail,
    health: r.health,
    checkinDue: r.checkinDue,
    testimonial: r.testimonial,
    upgradeDealId: r.upgradeDealId,
    timeline: Array.isArray(r.timeline) ? (r.timeline as unknown as TimelineEntry[]) : [],
  }));
}

/** Email templates in display order. */
export async function loadEmailTemplates(): Promise<EmailTemplateRow[]> {
  const rows = await db.salesEmailTemplate.findMany({ orderBy: [{ sort: "asc" }, { title: "asc" }] });
  return rows.map((r) => ({ id: r.id, cat: r.cat, title: r.title, purpose: r.purpose, body: r.body }));
}
