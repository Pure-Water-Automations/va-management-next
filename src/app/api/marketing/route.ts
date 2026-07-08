import type { Role } from "@prisma/client";
import { action, str, optNum, optStr } from "@/lib/api";
import { isSalesRep } from "@/lib/auth/roles";
import { isSalesConsoleMode } from "@/lib/mode";
import { db } from "@/lib/db";

// One route, dispatched on `op`, for every Marketing console mutation.
// Sales reps + admins; on a sales-console deployment every staff login.
const allow = (role: Role) => isSalesRep(role) || isSalesConsoleMode();

const CONTENT_STATUSES = new Set(["idea", "draft", "inprogress", "scheduled", "published"]);
const TESTIMONIAL_STAGES = new Set(["torequest", "requested", "received", "published"]);

/** Attribution tag: lowercase, non-alphanumeric → "-", max 24 chars. */
function slugTag(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return slug || "campaign";
}

/** Ensure the tag is unique across campaigns (append -2, -3, … if taken). */
async function uniqueTag(base: string): Promise<string> {
  let tag = base;
  for (let i = 2; ; i++) {
    const existing = await db.marketingCampaign.findUnique({ where: { tag } });
    if (!existing) return tag;
    const suffix = `-${i}`;
    tag = base.slice(0, 24 - suffix.length).replace(/-+$/g, "") + suffix;
  }
}

export const POST = action(
  async ({ body }) => {
    const op = str(body, "op");
    switch (op) {
      case "campaign_create": {
        const name = str(body, "name").trim();
        const channel = optStr(body, "channel") ?? "Facebook";
        const tag = await uniqueTag(slugTag(name));
        const c = await db.marketingCampaign.create({
          data: {
            name,
            channel,
            status: "draft",
            dates: "Draft",
            tag,
            descr: "New campaign — add a description and launch date.",
          },
        });
        return {
          id: c.id,
          name: c.name,
          channel: c.channel,
          status: c.status,
          dates: c.dates,
          tag: c.tag,
          descr: c.descr,
          leads: 0,
          won: 0,
          openPipeline: 0,
          attributed: [],
        };
      }

      case "content_create": {
        const title = str(body, "title").trim();
        const type = optStr(body, "type") ?? "social";
        const now = new Date();
        const year = optNum(body, "year") ?? now.getFullYear();
        const monthNum = optNum(body, "month") ?? now.getMonth() + 1; // 1-12
        const month = Math.min(12, Math.max(1, Math.round(monthNum)));
        const rawDay = optNum(body, "day") ?? 14;
        const daysInMonth = new Date(year, month, 0).getDate();
        const day = Math.min(daysInMonth, Math.max(1, Math.round(rawDay) || 14));
        const item = await db.contentItem.create({
          data: {
            date: new Date(year, month - 1, day, 12), // noon dodges TZ edges
            title,
            type,
            status: "draft",
            notes: "Added from the calendar.",
          },
        });
        return {
          id: item.id,
          dateISO: item.date.toISOString(),
          title: item.title,
          type: item.type,
          status: item.status,
          notes: item.notes,
        };
      }

      case "content_status": {
        const status = str(body, "status");
        if (!CONTENT_STATUSES.has(status)) throw new Error(`Invalid content status: ${status}`);
        const item = await db.contentItem.update({ where: { id: str(body, "id") }, data: { status } });
        return { id: item.id, status: item.status };
      }

      case "social_approve": {
        const post = await db.socialPost.update({ where: { id: str(body, "id") }, data: { status: "scheduled" } });
        return { id: post.id, status: post.status };
      }

      case "social_ready": {
        const post = await db.socialPost.update({ where: { id: str(body, "id") }, data: { status: "approval" } });
        return { id: post.id, status: post.status };
      }

      case "sequence_toggle": {
        const id = str(body, "id");
        const seq = await db.emailSequence.findUnique({ where: { id } });
        if (!seq) throw new Error("Sequence not found.");
        const status = seq.status === "active" ? "paused" : "active";
        await db.emailSequence.update({ where: { id }, data: { status } });
        return { id, status };
      }

      case "testimonial_advance": {
        const stage = str(body, "stage");
        if (!TESTIMONIAL_STAGES.has(stage)) throw new Error(`Invalid testimonial stage: ${stage}`);
        const t = await db.marketingTestimonial.update({ where: { id: str(body, "id") }, data: { stage } });
        return { id: t.id, stage: t.stage };
      }

      case "referrer_thanks": {
        // No state change — the thank-you is queued by the email tooling; the
        // client shows the confirmation toast. Kept as an op for auditing.
        const r = await db.referrer.findUnique({ where: { id: str(body, "id") } });
        if (!r) throw new Error("Referrer not found.");
        return { id: r.id };
      }

      case "referrer_log": {
        const id = str(body, "id");
        const referrer = await db.referrer.findUnique({ where: { id } });
        if (!referrer) throw new Error("Referrer not found.");
        const now = new Date();
        const [deal] = await db.$transaction([
          db.deal.create({
            data: {
              orgName: `New referral — via ${referrer.name}`,
              stage: "new",
              source: "referral",
              accountOwnerEmail: "mark.patton@purewaterautomations.com",
              leadSummary: "Logged from the referral program — qualify and reach out.",
              lastContactAt: now,
            },
          }),
          db.referrer.update({
            where: { id },
            data: { sent: { increment: 1 }, leads: { increment: 1 }, lastAt: now },
          }),
        ]);
        return { dealId: deal.id };
      }

      default:
        throw new Error(`Unknown op: ${op}`);
    }
  },
  { allow },
);
