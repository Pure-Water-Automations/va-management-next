import { SUPERVISOR_RECOMMENDATIONS, type SupervisorRecommendation } from "@/lib/services/evaluation-rubric";

/** Parse a { categoryKey: 1..5 } scores object from a request body. */
export function parseScores(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Missing field: scores");
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const n = Number(value);
    if (!Number.isFinite(n)) continue;
    out[key] = n;
  }
  if (Object.keys(out).length === 0) throw new Error("No scores provided.");
  return out;
}

/** Parse a { categoryKey: "narrative" } object (all optional). */
export function parseNarratives(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string" && value.trim()) out[key] = value.trim();
  }
  return out;
}

export function parseRecommendation(raw: string | undefined): SupervisorRecommendation {
  const value = (raw ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");
  if ((SUPERVISOR_RECOMMENDATIONS as readonly string[]).includes(value)) {
    return value as SupervisorRecommendation;
  }
  throw new Error(`Invalid recommendation: ${raw}`);
}
