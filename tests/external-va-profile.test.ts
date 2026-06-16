import { test } from "node:test";
import assert from "node:assert/strict";
import type { Va } from "@prisma/client";

// env.ts parses process.env once at import time, so set the secret BEFORE the
// module under test is first loaded. The dynamic import lives inside the tests
// (tsx's cjs transform disallows top-level await), but this assignment runs at
// module load — before any import() resolves.
const SECRET = "test-external-secret-value";
process.env.EXTERNAL_APP_SECRET = SECRET;
const load = () => import("../src/lib/external/va-profile");

test("verifyExternalSecret accepts a correct Bearer token", async () => {
  const { verifyExternalSecret } = await load();
  assert.equal(verifyExternalSecret(`Bearer ${SECRET}`), true);
});

test("verifyExternalSecret rejects missing, malformed, and wrong tokens", async () => {
  const { verifyExternalSecret } = await load();
  assert.equal(verifyExternalSecret(null), false);
  assert.equal(verifyExternalSecret(""), false);
  assert.equal(verifyExternalSecret(SECRET), false); // no "Bearer " prefix
  assert.equal(verifyExternalSecret("Bearer "), false);
  assert.equal(verifyExternalSecret("Bearer wrong-token"), false);
  assert.equal(verifyExternalSecret(`Basic ${SECRET}`), false);
});

const sampleVa = {
  vaId: "VA-001",
  name: "Jane Doe",
  email: "jane@example.com",
  compensationRole: "TIER_2",
  status: "active",
  targetHoursWeekly: 40,
  baselineHours: 100,
  supervisorVaId: "VA-000",
  desklogUserId: "dl-1",
  skillSpecs: "design, copy",
  availabilityNotes: "mornings",
  lastCheckinDate: new Date("2026-01-01"),
  notionProfileUrl: "https://notion.so/jane",
  roleStartedDate: new Date("2025-03-15T00:00:00.000Z"),
  notionDisplayTier: "Tier 2",
  tierMismatchFlag: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-06-01"),
} as unknown as Va;

test("toExternalVaProfile returns only curated identity fields", async () => {
  const { toExternalVaProfile } = await load();
  const profile = toExternalVaProfile(sampleVa);
  assert.deepEqual(profile, {
    vaId: "VA-001",
    name: "Jane Doe",
    email: "jane@example.com",
    tier: "TIER_2",
    status: "active",
    supervisorVaId: "VA-000",
    skillSpecs: "design, copy",
    availabilityNotes: "mornings",
    notionProfileUrl: "https://notion.so/jane",
    roleStartedDate: "2025-03-15T00:00:00.000Z",
  });
});

test("toExternalVaProfile never leaks sensitive/internal fields", async () => {
  const { toExternalVaProfile } = await load();
  const profile = toExternalVaProfile(sampleVa) as Record<string, unknown>;
  for (const leak of [
    "targetHoursWeekly",
    "baselineHours",
    "desklogUserId",
    "lastCheckinDate",
    "tierMismatchFlag",
    "createdAt",
    "updatedAt",
  ]) {
    assert.equal(leak in profile, false, `should not expose ${leak}`);
  }
});

test("toExternalVaProfile handles null roleStartedDate", async () => {
  const { toExternalVaProfile } = await load();
  const profile = toExternalVaProfile({ ...sampleVa, roleStartedDate: null } as Va);
  assert.equal(profile.roleStartedDate, null);
});
