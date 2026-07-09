-- Link VA logins to their VA record by matching email.
--
-- The VA console resolves a login to its VA profile via User.vaId (Va.email ==
-- User.email is the canonical pairing). A login created manually via the user admin
-- was never given a vaId, so the person had a valid account but no VA console, no
-- dashboard, and never saw tasks delegated to them (e.g. Paula Mwila, Phillip
-- Karamagi — created before their Va.email was corrected, so nothing matched them up).
--
-- Backfill: link every still-unlinked login whose email matches a VA. Idempotent and
-- safe — Va.email is unique, and only rows with a NULL vaId are touched.
UPDATE "User" u
SET "vaId" = v."vaId"
FROM "Va" v
WHERE lower(u.email) = lower(v.email)
  AND u."vaId" IS NULL;
