import { test } from "node:test";
import assert from "node:assert/strict";
import { isOnboardingChecklistComplete, ONBOARDING_BOOLEAN_FIELDS } from "../src/lib/sales/onboarding-checklist";
import { slugify } from "../src/lib/sales/util";

function row(overrides: Record<string, boolean> = {}) {
  const base = Object.fromEntries(ONBOARDING_BOOLEAN_FIELDS.map((f) => [f, true]));
  return { ...base, ...overrides } as Record<(typeof ONBOARDING_BOOLEAN_FIELDS)[number], boolean>;
}

test("isOnboardingChecklistComplete true only when every item is done", () => {
  assert.equal(isOnboardingChecklistComplete(row()), true);
  assert.equal(isOnboardingChecklistComplete(row({ vaAssigned: false })), false);
  assert.equal(isOnboardingChecklistComplete(row({ intakeReceived: false, kickoffRecapSent: false })), false);
});

test("slugify produces URL-safe slugs and a fallback for empties", () => {
  assert.equal(slugify("Grace Community Church!"), "grace-community-church");
  assert.equal(slugify("  Hope & Co.  "), "hope-co");
  assert.match(slugify(""), /^org-[a-z0-9]+$/);
});
