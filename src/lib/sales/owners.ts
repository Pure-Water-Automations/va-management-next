// Sales/marketing team directory for the console screens. Seeded reps use
// @purewaterautomations.com addresses; Justin maps to his real login so the
// leadership screens line up with the actual account on the test box.

export type SalesOwner = {
  key: string;
  name: string;
  email: string;
  role: "Sales rep" | "Marketing VA" | "Team lead";
};

export const SALES_OWNERS: SalesOwner[] = [
  { key: "mark", name: "Mark Patton", email: "mark.patton@purewaterautomations.com", role: "Sales rep" },
  { key: "lei", name: "Lei", email: "lei@purewaterautomations.com", role: "Sales rep" },
  { key: "justin", name: "Justin Okamoto", email: "okamotomiak@gmail.com", role: "Team lead" },
  { key: "zawadi", name: "Zawadi Suwan", email: "zawadi@purewaterautomations.com", role: "Marketing VA" },
];

/** Deal owners selectable in deal forms (sales reps + the team lead). */
export const DEAL_OWNERS = SALES_OWNERS.filter((o) => o.role !== "Marketing VA");

export function ownerByEmail(email: string | null | undefined): SalesOwner | null {
  if (!email) return null;
  const e = email.toLowerCase();
  return SALES_OWNERS.find((o) => o.email.toLowerCase() === e) ?? null;
}

/** "Mark Patton" for a known owner, else the email local part, else "—". */
export function ownerLabel(email: string | null | undefined): string {
  const o = ownerByEmail(email);
  if (o) return o.name;
  return email ? email.split("@")[0]! : "—";
}
