import type { Prisma } from "@prisma/client";
import { action, str, optStr } from "@/lib/api";
import { db } from "@/lib/db";
import { salesAccessFor } from "@/lib/auth/sales-guard";
import { pkgByName, nextPkgOf } from "@/lib/sales/packages";

// Op-dispatch API for the Sales console screens (Follow-ups, Client Accounts,
// Email Templates + the Client drawer). Open to sales reps / admins; on a
// sales-console deployment (CONSOLE_MODE="sales") every staff login qualifies.
// Staff-only, mirroring requireSalesUser: in sales-console mode any STAFF
// role may act, but client-portal logins never can (the page guard bounces
// them to /client; the API must enforce the same line).
// Same line the pages draw: sales reps + all-access (admin/TESTER); on a
// sales-console deployment any staff login; client-portal logins never.
const allowUser = (user: { role: import("@prisma/client").Role; isAdmin: boolean }) =>
  salesAccessFor(user) === "ok";

const INTERACTION_TYPES = new Set(["call", "email", "note", "checkin"]);

/** Parse a date-input value ("2026-07-09") as LOCAL noon so day-bucketing
 *  on the client never shifts a day across timezones. */
function parseDay(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12);
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${s}`);
  return d;
}

/** Short timeline date label, e.g. "Jul 7". */
function dateLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function daysFromNow(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0);
  return d;
}

async function getAccount(id: string) {
  const account = await db.clientAccount.findUnique({ where: { id } });
  if (!account) throw new Error("Client account not found.");
  return account;
}

export const POST = action(
  async ({ body }) => {
    const op = str(body, "op");
    switch (op) {
      // ── Follow-ups ──────────────────────────────────────────────────
      case "followup_add": {
        const due = parseDay(str(body, "due"));
        return db.salesFollowUp.create({
          data: {
            title: str(body, "title").trim(),
            due,
            kind: optStr(body, "kind") ?? "email",
            detail: "Added manually",
          },
        });
      }
      case "followup_snooze": {
        const id = str(body, "id");
        const cur = await db.salesFollowUp.findUnique({ where: { id } });
        if (!cur) throw new Error("Follow-up not found.");
        const due = new Date(cur.due);
        const requestedDays = typeof body.days === "number" && Number.isFinite(body.days) ? body.days : 7;
        const days = Math.min(60, Math.max(1, requestedDays));
        due.setDate(due.getDate() + days);
        return db.salesFollowUp.update({ where: { id }, data: { due } });
      }
      case "followup_done":
        return db.salesFollowUp.update({ where: { id: str(body, "id") }, data: { doneAt: new Date() } });
      case "followup_done_bulk": {
        const ids = Array.isArray(body.ids)
          ? body.ids.filter((id): id is string => typeof id === "string").slice(0, 100)
          : [];
        return db.salesFollowUp.updateMany({ where: { id: { in: ids } }, data: { doneAt: new Date() } });
      }

      // ── Email templates ─────────────────────────────────────────────
      case "template_save":
        return db.salesEmailTemplate.update({
          where: { id: str(body, "id") },
          data: { body: str(body, "body") },
        });

      // ── Client accounts ─────────────────────────────────────────────
      case "account_log": {
        const account = await getAccount(str(body, "id"));
        const type = str(body, "type");
        if (!INTERACTION_TYPES.has(type)) throw new Error(`Invalid interaction type: ${type}`);
        const note = str(body, "note").trim();
        const entry = { date: dateLabel(new Date()), type, note };
        const timeline = Array.isArray(account.timeline) ? (account.timeline as Prisma.JsonArray) : [];
        await db.clientAccount.update({
          where: { id: account.id },
          data: {
            timeline: [entry, ...timeline] as Prisma.InputJsonValue,
            lastTouch: new Date(),
            ...(type === "checkin" ? { checkinDue: false } : {}),
          },
        });
        return { entry };
      }
      case "account_checkin": {
        const account = await getAccount(str(body, "id"));
        return db.salesFollowUp.create({
          data: {
            title: `Check-in call — ${account.org}`,
            detail: "Scheduled from the client drawer",
            kind: "check-in",
            due: daysFromNow(3),
            refType: "client",
            refId: account.id,
          },
        });
      }
      case "account_start_upgrade": {
        const account = await getAccount(str(body, "id"));
        // Idempotent: an open upgrade deal already exists → just return it.
        if (account.upgradeDealId) {
          const existing = await db.deal.findUnique({ where: { id: account.upgradeDealId } });
          if (existing) return { dealId: existing.id, existing: true };
        }
        const next = nextPkgOf(account.pkg);
        if (!next || next.price == null) throw new Error(`No next package tier above ${account.pkg}.`);
        const curHours = pkgByName(account.pkg)?.hours ?? Math.round(account.hoursUsed);
        const deal = await db.deal.create({
          data: {
            orgName: account.org,
            contactName: account.contact || null,
            contactEmail: account.email || null,
            accountOwnerEmail: account.ownerEmail || null,
            stage: "proposal_needed",
            packageName: next.name,
            dealValue: next.price,
            billingType: "retainer",
            source: "client",
            upgradeOfAccountId: account.id,
            leadSummary: `Upgrade from ${account.pkg} (${curHours} hrs) to ${next.name} (${next.hours} hrs).`,
            lastContactAt: new Date(),
          },
        });
        await db.clientAccount.update({ where: { id: account.id }, data: { upgradeDealId: deal.id } });
        await db.salesFollowUp.create({
          data: {
            title: `Send ${next.name} upgrade proposal — ${account.org}`,
            detail: `Upgrade deal for ${account.org}`,
            kind: "proposal",
            due: daysFromNow(1),
            refType: "deal",
            refId: deal.id,
          },
        });
        return { dealId: deal.id };
      }

      default:
        throw new Error(`Unknown op: ${op}`);
    }
  },
  { allowUser },
);
