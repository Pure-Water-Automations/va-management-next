/**
 * Drives the "New" nav tag for this promotion's freshly-shipped features.
 * Bump NEW_FEATURE_LAUNCH_DATE to the actual prod deploy date if it slips —
 * the tag is meant to disappear ~1 week after users can actually see the
 * feature, not one week after this constant was written.
 */
const NEW_FEATURE_LAUNCH_DATE = new Date("2026-07-14T00:00:00Z");
const NEW_TAG_WINDOW_DAYS = 7;

export function isFeatureNew(): boolean {
  const ageMs = Date.now() - NEW_FEATURE_LAUNCH_DATE.getTime();
  return ageMs >= 0 && ageMs < NEW_TAG_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
