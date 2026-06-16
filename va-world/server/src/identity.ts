// Pure identity resolution for an incoming connection. We trust the Cloudflare
// Access header first (set at the edge, not spoofable by the browser), then a
// dev-only ?email= join option, then an env fallback. Returns null if none.

export type ResolveEmailInput = {
  /** Value of the `cf-access-authenticated-user-email` request header, if any. */
  cfHeader?: string | string[] | null;
  /** Dev-only email passed as a join option (ignored when a CF header exists). */
  optionEmail?: unknown;
  /** Server env fallback (DEV_FALLBACK_EMAIL); empty string disables it. */
  fallbackEmail?: string;
};

function normalize(value: unknown): string | null {
  if (Array.isArray(value)) value = value[0];
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
}

export function resolveEmail(input: ResolveEmailInput): string | null {
  return (
    normalize(input.cfHeader) ??
    normalize(input.optionEmail) ??
    normalize(input.fallbackEmail) ??
    null
  );
}

/** Friendly display name from an email when no VA profile is available. */
export function guestNameFromEmail(email: string | null): string {
  if (!email) return "Guest";
  const local = email.split("@")[0] ?? "";
  return local.length > 0 ? local : "Guest";
}
