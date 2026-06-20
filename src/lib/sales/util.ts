/** Public base URL for tokenized links (sign/intake), trailing slash trimmed. */
export function appBaseUrl(settings: Map<string, string>): string {
  const base = process.env.APP_BASE_URL?.trim() || settings.get("app_base_url")?.trim() || "";
  return (base || "http://localhost:3032").replace(/\/+$/, "");
}

/** From-address for system email (system_email_from → hr_manager_email → founder). */
export function systemEmailFrom(settings: Map<string, string>): string {
  return (
    settings.get("system_email_from")?.trim() ||
    settings.get("hr_manager_email")?.trim() ||
    "okamotomiak@gmail.com"
  );
}

/** Internal recipients for sales/onboarding notices (Team Lead + HR), de-duped. */
export function teamRecipients(settings: Map<string, string>): string[] {
  const keys = ["team_lead_email", "hr_manager_email", "people_ops_email"];
  const seen = new Set<string>();
  for (const k of keys) {
    const v = settings.get(k)?.trim();
    if (v) seen.add(v.toLowerCase());
  }
  return [...seen];
}

export function companyName(settings: Map<string, string>): string {
  return settings.get("company_name")?.trim() || "Pure Water Automations";
}

export function firstName(name: string | null | undefined): string {
  return name?.trim().split(/\s+/)[0] ?? "";
}

/** URL-safe org slug. Falls back to a short random suffix if the name is empty. */
export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || `org-${Math.random().toString(36).slice(2, 8)}`;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
