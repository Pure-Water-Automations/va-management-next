/**
 * Speaker identity mapping for live capture (Phase 2).
 *
 * Per the planning doc: speaker identity is a DATA-MAPPING problem, not an AI
 * problem. RTMS transcript segments carry the Zoom display name (metadata.userName);
 * we resolve that against the console's User table BEFORE classification so the
 * classifier sees "[client] Dan: …" vs "[va] Aira: …". Resolution is conservative:
 * exact normalized match → unambiguous fuzzy (token) match → UNKNOWN. An ambiguous
 * name never auto-resolves — unresolved speakers must not drive owner assignment.
 *
 * Pure — no DB — unit-tested in tests/zoom-identity.test.ts.
 */

export type KnownPerson = {
  id: string;
  name: string | null;
  email: string;
  role: string; // Prisma Role as a string; kept loose so this module stays pure
};

export type SpeakerRoleLabel = "client" | "va" | "team lead" | "staff" | "unknown";

export type ResolvedSpeaker = {
  display: string; // the Zoom display name as spoken by RTMS
  userId: string | null;
  email: string | null;
  label: SpeakerRoleLabel;
  resolution: "exact" | "fuzzy" | "unknown";
};

/** Console role → the label the classifier sees (a commitment-structure signal). */
export function roleLabel(role: string | null | undefined): SpeakerRoleLabel {
  switch (role) {
    case "CLIENT_ADMIN":
    case "CLIENT_MEMBER":
      return "client";
    case "VA":
    case "SENIOR_VA":
      return "va";
    case "TEAM_LEAD":
      return "team lead";
    case "HR_MANAGER":
    case "PEOPLE_OPS":
    case "RECRUITER":
    case "SALES":
    case "BOOKKEEPER":
    case "TESTER":
      return "staff";
    default:
      return "unknown";
  }
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip diacritics (combining marks after NFKD)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const tokens = (s: string) => normalize(s).split(" ").filter((t) => t.length >= 2);

/**
 * Do all of `a`'s tokens match into `b` (each `a` token equals or prefixes some
 * `b` token)? Handles "Justin" ⊂ "Justin Okamoto" and "Justin O" ⊂ "Justin Okamoto".
 */
function tokensSubsume(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  return a.every((ta) => b.some((tb) => tb === ta || tb.startsWith(ta)));
}

/**
 * Resolve one Zoom display name against the known people list.
 * Ambiguity (2+ candidates at the same tier) resolves to UNKNOWN by design.
 */
export function resolveSpeaker(displayName: string, people: KnownPerson[]): ResolvedSpeaker {
  const display = String(displayName || "").trim() || "Unknown speaker";
  const unknown: ResolvedSpeaker = { display, userId: null, email: null, label: "unknown", resolution: "unknown" };
  const norm = normalize(display);
  if (!norm) return unknown;

  const named = people.filter((p) => (p.name ?? "").trim());

  const exact = named.filter((p) => normalize(p.name!) === norm);
  if (exact.length === 1) {
    const p = exact[0];
    return { display, userId: p.id, email: p.email, label: roleLabel(p.role), resolution: "exact" };
  }
  if (exact.length > 1) return unknown;

  const speakerToks = tokens(display);
  const fuzzy = named.filter((p) => {
    const personToks = tokens(p.name!);
    return tokensSubsume(speakerToks, personToks) || tokensSubsume(personToks, speakerToks);
  });
  if (fuzzy.length === 1) {
    const p = fuzzy[0];
    return { display, userId: p.id, email: p.email, label: roleLabel(p.role), resolution: "fuzzy" };
  }
  return unknown;
}

/**
 * Resolve a whole roster once (speaker names repeat constantly in a transcript —
 * callers should cache by display name; this helper builds that cache).
 */
export function buildSpeakerCache(names: string[], people: KnownPerson[]): Map<string, ResolvedSpeaker> {
  const cache = new Map<string, ResolvedSpeaker>();
  for (const n of names) {
    if (!cache.has(n)) cache.set(n, resolveSpeaker(n, people));
  }
  return cache;
}
