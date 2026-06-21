import type { ClientOnboarding } from "@prisma/client";

// Pure checklist definition for client onboarding — no db/env imports, so it is
// safe to unit-test in isolation and reuse on the server.
export const ONBOARDING_BOOLEAN_FIELDS = [
  "intakeReceived",
  "onboardingCallBooked",
  "onboardingCallDone",
  "driveFolderCreated",
  "portalAccessGranted",
  "commsCadenceSet",
  "firstWeekPriorities",
  "vaAssigned",
  "kickoffRecapSent",
] as const;

export type OnboardingBooleanField = (typeof ONBOARDING_BOOLEAN_FIELDS)[number];

/** Pure: every checklist item complete? Used to gate "mark complete". */
export function isOnboardingChecklistComplete(row: Pick<ClientOnboarding, OnboardingBooleanField>): boolean {
  return ONBOARDING_BOOLEAN_FIELDS.every((f) => row[f]);
}
