/**
 * Seed login `User` rows for active VAs so tasks can actually be assigned to them.
 *
 * - Source: active `Va` records (status = "active"). Training/test records are skipped.
 * - Role mapping: TIER_3 "Senior VA" (and TIER_4 "Lead") → SENIOR_VA so they can
 *   delegate by default and still receive tasks; everyone else → VA.
 * - Idempotent & non-destructive: if a User with that email already exists (e.g. a
 *   manager who is also a VA), it is SKIPPED untouched — never re-roled or relinked.
 *
 * Run on the VPS with the prod env loaded:
 *   set -a && . ../shared/.env.production && set +a && npx tsx scripts/seed-va-users.ts
 * Preview only (no writes): prefix with DRY_RUN=1.
 */
import { db } from "@/lib/db";
import type { Role } from "@prisma/client";

const DRY = process.env.DRY_RUN === "1";

function roleForTier(comp: string): Role {
  return comp === "TIER_3" || comp === "TIER_4" ? "SENIOR_VA" : "VA";
}

async function main() {
  const vas = await db.va.findMany({
    where: { status: "active" },
    select: { vaId: true, name: true, email: true, compensationRole: true },
    orderBy: [{ compensationRole: "asc" }, { name: "asc" }],
  });

  let created = 0;
  let skipped = 0;
  for (const va of vas) {
    const email = va.email.toLowerCase();
    const existing = await db.user.findUnique({ where: { email }, select: { role: true } });
    if (existing) {
      console.log(`SKIP   ${email} — already a User (${existing.role}); left untouched`);
      skipped++;
      continue;
    }
    const role = roleForTier(va.compensationRole);
    console.log(`CREATE ${email} → ${role}  (${va.compensationRole})  "${va.name}"  vaId=${va.vaId}`);
    if (!DRY) {
      await db.user.create({
        data: { email, name: va.name, role, active: true, isAdmin: false, vaId: va.vaId },
      });
    }
    created++;
  }

  console.log(
    `\n${DRY ? "[DRY RUN] " : ""}Done. created=${created} skipped=${skipped} (of ${vas.length} active VAs)`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
