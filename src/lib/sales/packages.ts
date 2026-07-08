// The PWA client package ladder — single source of truth for the sales &
// marketing console (pipeline, client accounts, upgrade paths, landing page).

export type SalesPackage = {
  name: string;
  price: number | null; // $/month (null = unpriced: Hourly, Custom)
  hours: number | null; // included hours/month
  rate?: number; // $/hr, Hourly only
};

export const PACKAGES: SalesPackage[] = [
  { name: "Hourly", price: null, hours: null, rate: 10 },
  { name: "Spring", price: 200, hours: 20 },
  { name: "Stream", price: 800, hours: 68 },
  { name: "River", price: 1400, hours: 136 },
  { name: "Ocean", price: 2400, hours: 244 },
  { name: "Ocean Plus", price: 3600, hours: 392 },
  { name: "Ocean Enterprise", price: 4700, hours: 552 },
  { name: "Custom", price: null, hours: null },
];

// Upgrade ladder (priced tiers, in order). Hourly upgrades into Spring.
export const LADDER = ["Spring", "Stream", "River", "Ocean", "Ocean Plus", "Ocean Enterprise"];

export function pkgByName(name: string | null | undefined): SalesPackage | null {
  if (!name) return null;
  return PACKAGES.find((p) => p.name.toLowerCase() === name.trim().toLowerCase()) ?? null;
}

/** The next tier up, or null when already at the top / unknown / Custom. */
export function nextPkgOf(name: string | null | undefined): SalesPackage | null {
  if (!name) return null;
  if (name === "Hourly") return pkgByName("Spring");
  const i = LADDER.indexOf(name);
  if (i === -1 || i === LADDER.length - 1) return null;
  return pkgByName(LADDER[i + 1]);
}

/** "$4.5k" for thousands, "$750" below. */
export function compactMoney(n: number): string {
  if (Math.abs(n) >= 1000) {
    const k = n / 1000;
    return `$${Number.isInteger(k) ? k : k.toFixed(1)}k`;
  }
  return `$${Math.round(n).toLocaleString()}`;
}

/** Option label for package selects: "Stream — $800/mo · 68 hrs". */
export function pkgOptionLabel(p: SalesPackage): string {
  if (p.rate) return `${p.name} — $${p.rate}/hr`;
  if (p.price == null) return p.name;
  return `${p.name} — $${p.price.toLocaleString()}/mo · ${p.hours} hrs`;
}
