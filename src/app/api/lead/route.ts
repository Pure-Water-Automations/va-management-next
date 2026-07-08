import type { Prisma } from "@prisma/client";
import { action, str, optStr, optNum } from "@/lib/api";
import { db } from "@/lib/db";
import { parseKrs } from "@/lib/reads/lead";

const GOAL_STATUSES = new Set(["Not started", "In progress", "On track", "At risk", "Done"]);

// Leadership writes (goals + target numbers). Admin-only: the `allow`
// predicate rejects every role, and `action()` lets admins bypass it —
// which is exactly the /lead access rule.
export const POST = action(
  async ({ body }) => {
    const op = str(body, "op");
    switch (op) {
      case "goal_create": {
        const title = str(body, "title").trim();
        return db.salesGoal.create({
          data: {
            title,
            ownerEmail: optStr(body, "ownerEmail") ?? "",
            due: optStr(body, "due") ?? "Sep 30",
            status: "Not started",
            krs: [{ id: "k1", label: "Define the first key result", done: false }] as unknown as Prisma.InputJsonValue,
          },
        });
      }
      case "goal_update": {
        const id = str(body, "id");
        const data: Prisma.SalesGoalUpdateInput = {};
        const ownerEmail = optStr(body, "ownerEmail");
        if (ownerEmail !== undefined) data.ownerEmail = ownerEmail;
        const status = optStr(body, "status");
        if (status !== undefined) {
          if (!GOAL_STATUSES.has(status)) throw new Error(`Unknown goal status: ${status}`);
          data.status = status;
        }
        if (Object.keys(data).length === 0) throw new Error("Nothing to update.");
        return db.salesGoal.update({ where: { id }, data });
      }
      case "goal_kr_toggle": {
        const id = str(body, "id");
        const krId = str(body, "krId");
        const goal = await db.salesGoal.findUniqueOrThrow({ where: { id } });
        const krs = parseKrs(goal.krs).map((k) => (k.id === krId ? { ...k, done: !k.done } : k));
        return db.salesGoal.update({ where: { id }, data: { krs: krs as unknown as Prisma.InputJsonValue } });
      }
      case "target_set": {
        const id = str(body, "id");
        const target = Math.max(1, Math.round(optNum(body, "target") ?? 1));
        return db.salesTarget.update({ where: { id }, data: { target } });
      }
      default:
        throw new Error(`Unknown op: ${op}`);
    }
  },
  { allow: () => false },
);
