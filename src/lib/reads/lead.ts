import { db } from "@/lib/db";
import { SALES_OWNERS } from "@/lib/sales/owners";
import { compactMoney } from "@/lib/sales/packages";
import { fmtTargetValue, monthInfo } from "@/lib/sales/pace";

// ─────────────────────────────────────────────────────────────────────────
// Leadership reads — the target-actuals engine plus the Big Picture / Team
// aggregations. Every "actual" is a live SELECT over the same tables the
// sales & marketing consoles write to; nothing is stored twice.
// ─────────────────────────────────────────────────────────────────────────

const CLOSED_STAGES = new Set(["won", "lost"]);

type Snapshot = {
  now: Date;
  deals: {
    id: string;
    stage: string;
    dealValue: number | null;
    source: string | null;
    accountOwnerEmail: string | null;
    createdAt: Date;
    discoveryCallStatus: string | null;
    discoveryCallAt: Date | null;
    upgradeOfAccountId: string | null;
  }[];
  accounts: { id: string; price: number; lastTouch: Date; ownerEmail: string }[];
  content: { date: Date; status: string }[];
  socials: { status: string }[];
  testimonialsPublished: number;
  sequencesActive: number;
  followupsOpen: { due: Date; refType: string | null; refId: string | null }[];
  goalsAtRisk: number;
};

async function loadSnapshot(): Promise<Snapshot> {
  const [deals, accounts, content, socials, testimonialsPublished, sequencesActive, followupsOpen, goalsAtRisk] =
    await Promise.all([
      db.deal.findMany({
        select: {
          id: true,
          stage: true,
          dealValue: true,
          source: true,
          accountOwnerEmail: true,
          createdAt: true,
          discoveryCallStatus: true,
          discoveryCallAt: true,
          upgradeOfAccountId: true,
        },
      }),
      db.clientAccount.findMany({ select: { id: true, price: true, lastTouch: true, ownerEmail: true } }),
      db.contentItem.findMany({ select: { date: true, status: true } }),
      db.socialPost.findMany({ select: { status: true } }),
      db.marketingTestimonial.count({ where: { stage: "published" } }),
      db.emailSequence.count({ where: { status: "active" } }),
      db.salesFollowUp.findMany({ where: { doneAt: null }, select: { due: true, refType: true, refId: true } }),
      db.salesGoal.count({ where: { status: "At risk" } }),
    ]);
  return {
    now: new Date(),
    deals,
    accounts,
    content,
    socials,
    testimonialsPublished,
    sequencesActive,
    followupsOpen,
    goalsAtRisk,
  };
}

function monthBounds(now: Date): [Date, Date] {
  return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
}

/**
 * Actual value per SalesTarget.kind (kind strings match the seed:
 * mrr · newLeads · discoCalls · won · newRevenue · upgrades · discoverLeads ·
 * contentPublished · testimonials — a few aliases tolerated).
 */
function computeActuals(s: Snapshot): Record<string, number> {
  const [start, end] = monthBounds(s.now);
  const inMonth = (d: Date | null) => !!d && d >= start && d < end;
  const wonDeals = s.deals.filter((d) => d.stage === "won");
  return {
    // Company
    mrr: Math.round(s.accounts.reduce((sum, a) => sum + (a.price || 0), 0)),
    // Sales
    newLeads: s.deals.filter((d) => inMonth(d.createdAt)).length,
    discoCalls: s.deals.filter((d) => d.discoveryCallStatus === "completed" && inMonth(d.discoveryCallAt)).length,
    won: wonDeals.length,
    newRevenue: Math.round(wonDeals.reduce((sum, d) => sum + (d.dealValue || 0), 0)),
    upgrades: s.deals.filter((d) => d.upgradeOfAccountId && !CLOSED_STAGES.has(d.stage)).length,
    // Marketing
    discoverLeads: s.deals.filter((d) => d.source === "discover" && inMonth(d.createdAt)).length,
    contentPublished:
      s.content.filter((c) => c.status === "published").length + s.socials.filter((p) => p.status === "posted").length,
    testimonials: s.testimonialsPublished,
  };
}

const KIND_ALIASES: Record<string, string> = {
  callsHeld: "discoCalls",
  dealsWon: "won",
  caseStudies: "testimonials",
};

function actualFor(kind: string, actuals: Record<string, number>): number {
  return actuals[kind] ?? actuals[KIND_ALIASES[kind] ?? ""] ?? 0;
}

// ── Targets ──────────────────────────────────────────────────────────────

export type TargetRow = {
  id: string;
  grp: string; // Company | Sales | Marketing
  label: string;
  hint: string;
  unit: string; // "$" | "#"
  target: number;
  actual: number;
};

export async function loadTargets(): Promise<TargetRow[]> {
  const [snapshot, targets] = await Promise.all([
    loadSnapshot(),
    db.salesTarget.findMany({ orderBy: { sort: "asc" } }),
  ]);
  const actuals = computeActuals(snapshot);
  return targets.map((t) => ({
    id: t.id,
    grp: t.grp,
    label: t.label,
    hint: t.hint,
    unit: t.unit,
    target: t.target,
    actual: actualFor(t.kind, actuals),
  }));
}

// ── Goals ────────────────────────────────────────────────────────────────

export type GoalKr = { id: string; label: string; done: boolean };
export type GoalRow = {
  id: string;
  title: string;
  ownerEmail: string;
  due: string;
  status: string;
  krs: GoalKr[];
};

export function parseKrs(value: unknown): GoalKr[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((k): k is Record<string, unknown> => !!k && typeof k === "object")
    .map((k, i) => ({
      id: typeof k.id === "string" ? k.id : `k${i + 1}`,
      label: typeof k.label === "string" ? k.label : "",
      done: k.done === true,
    }));
}

export async function loadGoals(): Promise<GoalRow[]> {
  const goals = await db.salesGoal.findMany({ orderBy: { createdAt: "desc" } });
  return goals.map((g) => ({
    id: g.id,
    title: g.title,
    ownerEmail: g.ownerEmail,
    due: g.due,
    status: g.status,
    krs: parseKrs(g.krs),
  }));
}

// ── Team ─────────────────────────────────────────────────────────────────

export type TeamMember = {
  key: string;
  name: string;
  role: string;
  console: "sales" | "marketing";
  /** Four stat tiles (2×2). */
  stats: { label: string; value: string; warn?: boolean }[];
  /** "6 open deals · $2.9k pipeline value" — first two stats joined. */
  summary: string;
};

function buildTeam(s: Snapshot, actuals: Record<string, number>): TeamMember[] {
  const { monthName, monthShort } = monthInfo(s.now);
  const [start, end] = monthBounds(s.now);
  const startOfToday = new Date(s.now.getFullYear(), s.now.getMonth(), s.now.getDate());

  // Join overdue follow-ups to owners via the referenced deal / client account.
  const dealOwner = new Map(s.deals.map((d) => [d.id, (d.accountOwnerEmail ?? "").toLowerCase()]));
  const accountOwner = new Map(s.accounts.map((a) => [a.id, (a.ownerEmail ?? "").toLowerCase()]));
  const overdueByOwner = new Map<string, number>();
  for (const f of s.followupsOpen) {
    if (f.due >= startOfToday) continue; // not overdue yet
    const owner =
      f.refType === "deal" ? dealOwner.get(f.refId ?? "") : f.refType === "client" ? accountOwner.get(f.refId ?? "") : undefined;
    if (!owner) continue;
    overdueByOwner.set(owner, (overdueByOwner.get(owner) ?? 0) + 1);
  }

  return SALES_OWNERS.filter((o) => o.role !== "Team lead").map((o) => {
    if (o.role === "Sales rep") {
      const email = o.email.toLowerCase();
      const mine = s.deals.filter((d) => (d.accountOwnerEmail ?? "").toLowerCase() === email);
      const open = mine.filter((d) => !CLOSED_STAGES.has(d.stage));
      const pipeline = open.reduce((sum, d) => sum + (d.dealValue || 0), 0);
      const won = mine.filter((d) => d.stage === "won").length;
      const overdue = overdueByOwner.get(email) ?? 0;
      const stats = [
        { label: "open deals", value: String(open.length) },
        { label: "pipeline value", value: compactMoney(pipeline) },
        { label: `won in ${monthName}`, value: String(won) },
        { label: "overdue follow-ups", value: String(overdue), warn: overdue > 0 },
      ];
      return {
        key: o.key,
        name: o.name,
        role: o.role,
        console: "sales" as const,
        stats,
        summary: `${open.length} open deals · ${compactMoney(pipeline)} pipeline value`,
      };
    }
    // Marketing VA
    const planned = s.content.filter((c) => c.date >= start && c.date < end).length;
    const published = actuals.contentPublished ?? 0;
    const awaiting = s.socials.filter((p) => p.status === "approval").length;
    const stats = [
      { label: `content planned (${monthShort})`, value: String(planned) },
      { label: "published", value: String(published) },
      { label: "awaiting approval", value: String(awaiting), warn: awaiting > 0 },
      { label: "sequences running", value: String(s.sequencesActive) },
    ];
    return {
      key: o.key,
      name: o.name,
      role: o.role,
      console: "marketing" as const,
      stats,
      summary: `${planned} content planned (${monthShort}) · ${published} published`,
    };
  });
}

export async function loadTeam(): Promise<TeamMember[]> {
  const snapshot = await loadSnapshot();
  return buildTeam(snapshot, computeActuals(snapshot));
}

// ── The Big Picture ──────────────────────────────────────────────────────

export type LeadOverview = {
  monthName: string;
  kpis: { mrr: number; mrrTarget: number; openPipeline: number; won: number; newLeads: number };
  funnel: { label: string; count: number; won?: boolean }[];
  /** The four pinned targets (tg1, tg2, tg4, tg8) for the summary card. */
  pinned: { id: string; label: string; unit: string; actual: number; target: number; line: string }[];
  /** Non-zero alerts only; empty array = "All clear". */
  alerts: { count: number; label: string; href: string }[];
  team: { key: string; name: string; role: string; summary: string }[];
};

const FUNNEL_BUCKETS: { label: string; stages: string[]; won?: boolean }[] = [
  { label: "New", stages: ["new"] },
  { label: "Discovery", stages: ["discovery_scheduled", "discovery_completed"] },
  { label: "Proposal", stages: ["proposal_needed", "proposal_sent"] },
  { label: "Closing", stages: ["negotiation", "verbal_yes"] },
  { label: "Won", stages: ["won"], won: true },
];

export async function loadLeadOverview(): Promise<LeadOverview> {
  const [snapshot, targets] = await Promise.all([
    loadSnapshot(),
    db.salesTarget.findMany({ orderBy: { sort: "asc" } }),
  ]);
  const actuals = computeActuals(snapshot);
  const { monthName } = monthInfo(snapshot.now);
  const startOfToday = new Date(snapshot.now.getFullYear(), snapshot.now.getMonth(), snapshot.now.getDate());
  const quiet = new Date(snapshot.now.getTime() - 21 * 24 * 60 * 60 * 1000);

  const openPipeline = snapshot.deals
    .filter((d) => !CLOSED_STAGES.has(d.stage))
    .reduce((sum, d) => sum + (d.dealValue || 0), 0);

  const targetById = new Map(targets.map((t) => [t.id, t]));
  const mrrTarget = targetById.get("tg1")?.target ?? 0;

  const pinned = ["tg1", "tg2", "tg4", "tg8"].flatMap((id) => {
    const t = targetById.get(id);
    if (!t) return [];
    const actual = actualFor(t.kind, actuals);
    return [
      {
        id: t.id,
        label: t.label,
        unit: t.unit,
        actual,
        target: t.target,
        line: `${fmtTargetValue(actual, t.unit)} of ${fmtTargetValue(t.target, t.unit)}`,
      },
    ];
  });

  const overdueFollowups = snapshot.followupsOpen.filter((f) => f.due < startOfToday).length;
  const quietClients = snapshot.accounts.filter((a) => a.lastTouch < quiet).length;
  const socialApproval = snapshot.socials.filter((p) => p.status === "approval").length;

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const alerts = [
    { count: overdueFollowups, label: `${plural(overdueFollowups, "follow-up")} overdue in sales`, href: "/sales/followups" },
    { count: quietClients, label: `${plural(quietClients, "client")} quiet for 3+ weeks`, href: "/sales/clients" },
    { count: socialApproval, label: `${plural(socialApproval, "social post")} waiting for approval`, href: "/marketing/social" },
    { count: snapshot.goalsAtRisk, label: `${plural(snapshot.goalsAtRisk, "goal")} at risk this quarter`, href: "/lead/goals" },
  ].filter((a) => a.count > 0);

  return {
    monthName,
    kpis: {
      mrr: actuals.mrr,
      mrrTarget,
      openPipeline: Math.round(openPipeline),
      won: actuals.won,
      newLeads: actuals.newLeads,
    },
    funnel: FUNNEL_BUCKETS.map((b) => ({
      label: b.label,
      count: snapshot.deals.filter((d) => b.stages.includes(d.stage)).length,
      won: b.won,
    })),
    pinned,
    alerts,
    team: buildTeam(snapshot, actuals).map(({ key, name, role, summary }) => ({ key, name, role, summary })),
  };
}
