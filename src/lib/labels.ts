/**
 * Shared display-label helpers so user-facing copy never leaks raw enum ids.
 * Pure + dependency-free.
 */

/** Humanize an underscored enum id: "TIER_2" → "Tier 2", "TRAINEE" → "Trainee". */
export function humanRole(role: string): string {
  return role.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The noun for a count: pluralize(1,"session") → "session"; pluralize(3,"session") → "sessions". */
export function pluralize(n: number, singular: string, plural?: string): string {
  return n === 1 ? singular : (plural ?? `${singular}s`);
}

/** Title-case a lowercase enum for display: "open" → "Open". */
export function titleCase(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Space-out a CamelCase TaskStrategy enum: "TechSupport" → "Tech Support". */
export function taskStrategyLabel(s: string): string {
  return s.replace(/([a-z])([A-Z])/g, "$1 $2");
}
