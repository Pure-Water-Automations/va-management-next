-- Role taxonomy overhaul: tier-driven views, de-bloated HR, + Tester role.

-- AlterEnum: add the all-access QA role. SENIOR_VA / TEAM_LEAD are kept as
-- deprecated values (retired from the assignable set below, not dropped — removing
-- a Postgres enum value needs a fragile enum swap; defer until confirmed unused).
ALTER TYPE "Role" ADD VALUE 'TESTER';

-- AlterTable: per-tier toggle that unlocks the Meeting Actions queue.
ALTER TABLE "CompensationRole" ADD COLUMN     "canReviewMeetingActions" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: Tier 3 (Senior) + Tier 4 (Lead) get Meeting Actions by default, so the
-- de-couple preserves today's senior-VA-and-up behavior.
UPDATE "CompensationRole" SET "canReviewMeetingActions" = true WHERE "roleId" IN ('TIER_3', 'TIER_4');

-- Data migration: retire SENIOR_VA / TEAM_LEAD as assignable roles. Seniority is now
-- tier-driven, so former Senior VAs become plain VAs (their comp tier carries the
-- seniority + delegation authority); Team Leads fold into HR Manager.
UPDATE "User" SET "role" = 'VA' WHERE "role" = 'SENIOR_VA';
UPDATE "User" SET "role" = 'HR_MANAGER' WHERE "role" = 'TEAM_LEAD';
