import { config } from "./env";

/** Curated VA profile returned by the manager's /api/external/va-profile. */
export type VaProfile = {
  vaId: string;
  name: string;
  email: string;
  tier: string;
  status: string;
  supervisorVaId: string | null;
  skillSpecs: string | null;
  availabilityNotes: string | null;
  notionProfileUrl: string | null;
  roleStartedDate: string | null;
};

type FetchLike = typeof fetch;

/**
 * Resolve a VA profile by email via the manager's read-only bridge. Returns null
 * for any non-200 (401/404/etc.), network error, or when the bridge isn't
 * configured — callers fall back to a guest identity. `fetchImpl` is injectable
 * for tests.
 */
export async function fetchVaProfile(
  email: string,
  fetchImpl: FetchLike = fetch,
): Promise<VaProfile | null> {
  if (!config.managerBaseUrl || !config.externalAppSecret) return null;

  const url = `${config.managerBaseUrl}/api/external/va-profile?email=${encodeURIComponent(email)}`;
  try {
    const res = await fetchImpl(url, {
      headers: { authorization: `Bearer ${config.externalAppSecret}` },
    });
    if (!res.ok) return null;
    return (await res.json()) as VaProfile;
  } catch {
    return null;
  }
}

/** Directory entry from the manager's /api/external/roster. */
export type RosterEntry = { vaId: string; name: string; tier: string; status: string };

/**
 * Fetch the active-VA directory from the manager. Returns [] when the bridge
 * isn't configured or on any error — the directory just shows who's online.
 */
export async function fetchRoster(fetchImpl: FetchLike = fetch): Promise<RosterEntry[]> {
  if (!config.managerBaseUrl || !config.externalAppSecret) return [];

  try {
    const res = await fetchImpl(`${config.managerBaseUrl}/api/external/roster`, {
      headers: { authorization: `Bearer ${config.externalAppSecret}` },
    });
    if (!res.ok) return [];
    const body = (await res.json()) as { entries?: RosterEntry[] };
    return Array.isArray(body.entries) ? body.entries : [];
  } catch {
    return [];
  }
}
