import { db } from "@/lib/db";

// Server read helpers for the Marketing console. The core rule (from the
// design): marketing and sales share ONE deals table — every campaign /
// source metric here is a live query over Deal grouped by `source`
// (Deal.source === MarketingCampaign.tag), never a stored counter.

const TERMINAL_STAGES = ["won", "lost"]; // nurture / no_show still count as open

// Source tag → display label (seed campaigns; unknown tags fall back to the
// campaign name).
export const SOURCE_LABELS: Record<string, string> = {
  discover: "Discover form",
  "fb-pastors": "Pastors Facebook outreach",
  referral: "Referral program",
  newsletter: "Monthly newsletter",
  "kea-event": "KEA leaders webinar",
  client: "Existing client",
};

// ── Shared shapes ────────────────────────────────────────────────────────

export type AttributedLead = {
  id: string;
  orgName: string;
  contactName: string | null;
  stage: string;
  dealValue: number | null;
  billingType: string | null;
};

export type CampaignRow = {
  id: string;
  name: string;
  channel: string;
  status: string;
  dates: string;
  tag: string;
  descr: string;
  leads: number;
  won: number;
  openPipeline: number;
  attributed: AttributedLead[];
};

type DealLite = {
  id: string;
  orgName: string;
  contactName: string | null;
  stage: string;
  dealValue: number | null;
  billingType: string | null;
  source: string | null;
  createdAt: Date;
};

async function loadDealsLite(): Promise<DealLite[]> {
  return db.deal.findMany({
    select: {
      id: true,
      orgName: true,
      contactName: true,
      stage: true,
      dealValue: true,
      billingType: true,
      source: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

function groupBySource(deals: DealLite[]): Map<string, DealLite[]> {
  const m = new Map<string, DealLite[]>();
  for (const d of deals) {
    if (!d.source) continue;
    const list = m.get(d.source);
    if (list) list.push(d);
    else m.set(d.source, [d]);
  }
  return m;
}

function isOpen(d: DealLite): boolean {
  return !TERMINAL_STAGES.includes(d.stage);
}

function openSum(deals: DealLite[]): number {
  return deals.filter(isOpen).reduce((s, d) => s + (d.dealValue ?? 0), 0);
}

// ── Campaigns ────────────────────────────────────────────────────────────

export async function loadCampaignRows(): Promise<CampaignRow[]> {
  const [campaigns, deals] = await Promise.all([
    db.marketingCampaign.findMany({ orderBy: { createdAt: "asc" } }),
    loadDealsLite(),
  ]);
  const bySource = groupBySource(deals);
  return campaigns.map((c) => {
    const list = bySource.get(c.tag) ?? [];
    return {
      id: c.id,
      name: c.name,
      channel: c.channel,
      status: c.status,
      dates: c.dates,
      tag: c.tag,
      descr: c.descr,
      leads: list.length,
      won: list.filter((d) => d.stage === "won").length,
      openPipeline: openSum(list),
      attributed: list.map((d) => ({
        id: d.id,
        orgName: d.orgName,
        contactName: d.contactName,
        stage: d.stage,
        dealValue: d.dealValue,
        billingType: d.billingType,
      })),
    };
  });
}

// ── Dashboard ────────────────────────────────────────────────────────────

export type SourceBarRow = {
  campaignId: string;
  tag: string;
  label: string;
  count: number;
  won: number;
  open: number;
};

export type DueItem = {
  id: string;
  title: string;
  type: string;
  status: string;
  dateISO: string;
};

export type MarketingDashboardData = {
  monthLabel: string; // "July"
  newLeadsThisMonth: number;
  discoverTotal: number;
  discoverThisMonth: number;
  activeCampaigns: number;
  openMarketingPipeline: number;
  sources: SourceBarRow[];
  dueThisWeek: DueItem[];
  nurtureOrgs: string[];
  toRequestOrgs: string[];
};

export async function loadMarketingDashboard(): Promise<MarketingDashboardData> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  // Monday-based week containing today (the design's Jul 6–12 window).
  const diffToMonday = (now.getDay() + 6) % 7;
  const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToMonday);
  const weekEnd = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 7);

  const [campaigns, deals, dueThisWeek, nurtureDeals, toRequest] = await Promise.all([
    db.marketingCampaign.findMany({ orderBy: { createdAt: "asc" } }),
    loadDealsLite(),
    db.contentItem.findMany({
      where: { date: { gte: weekStart, lt: weekEnd } },
      orderBy: { date: "asc" },
    }),
    db.deal.findMany({ where: { stage: "nurture" }, select: { orgName: true } }),
    db.marketingTestimonial.findMany({ where: { stage: "torequest" }, select: { org: true } }),
  ]);

  const marketing = deals.filter((d) => d.source && d.source !== "client");
  const inMonth = (d: DealLite) => d.createdAt >= monthStart && d.createdAt < nextMonthStart;
  const discover = deals.filter((d) => d.source === "discover");
  const bySource = groupBySource(deals);

  const sources: SourceBarRow[] = campaigns
    .filter((c) => c.tag !== "client")
    .map((c) => {
      const list = bySource.get(c.tag) ?? [];
      return {
        campaignId: c.id,
        tag: c.tag,
        label: SOURCE_LABELS[c.tag] ?? c.name,
        count: list.length,
        won: list.filter((d) => d.stage === "won").length,
        open: openSum(list),
      };
    })
    .sort((a, b) => b.count - a.count);

  return {
    monthLabel: now.toLocaleDateString("en-US", { month: "long" }),
    newLeadsThisMonth: marketing.filter(inMonth).length,
    discoverTotal: discover.length,
    discoverThisMonth: discover.filter(inMonth).length,
    activeCampaigns: campaigns.filter((c) => c.status === "active").length,
    openMarketingPipeline: openSum(marketing),
    sources,
    dueThisWeek: dueThisWeek.map((i) => ({
      id: i.id,
      title: i.title,
      type: i.type,
      status: i.status,
      dateISO: i.date.toISOString(),
    })),
    nurtureOrgs: nurtureDeals.map((d) => d.orgName),
    toRequestOrgs: toRequest.map((t) => t.org),
  };
}

// ── Content calendar ─────────────────────────────────────────────────────

export type ContentRow = {
  id: string;
  dateISO: string;
  title: string;
  type: string;
  status: string;
  notes: string;
};

export async function loadContentRows(): Promise<ContentRow[]> {
  const items = await db.contentItem.findMany({ orderBy: { date: "asc" } });
  return items.map((i) => ({
    id: i.id,
    dateISO: i.date.toISOString(),
    title: i.title,
    type: i.type,
    status: i.status,
    notes: i.notes,
  }));
}

// ── Social queue ─────────────────────────────────────────────────────────

export type SocialRow = {
  id: string;
  platform: string;
  text: string;
  scheduledAtISO: string | null;
  status: string;
  metrics: string;
};

export async function loadSocialRows(): Promise<SocialRow[]> {
  const posts = await db.socialPost.findMany({ orderBy: [{ scheduledAt: "asc" }, { createdAt: "asc" }] });
  return posts.map((p) => ({
    id: p.id,
    platform: p.platform,
    text: p.text,
    scheduledAtISO: p.scheduledAt ? p.scheduledAt.toISOString() : null,
    status: p.status,
    metrics: p.metrics,
  }));
}

// ── Email planner ────────────────────────────────────────────────────────

export type SequenceStep = { day: string; subject: string; state: string };

export type SequenceRow = {
  id: string;
  name: string;
  descr: string;
  status: string;
  audienceKind: string;
  steps: SequenceStep[];
  next: string;
  audienceLabel: string; // computed live from the pipeline / client accounts
  audienceMembers: string[]; // org names (empty for the static subscriber list)
};

function parseSteps(v: unknown): SequenceStep[] {
  if (!Array.isArray(v)) return [];
  return v.map((raw) => {
    const s = (raw ?? {}) as Record<string, unknown>;
    return {
      day: typeof s.day === "string" ? s.day : String(s.day ?? ""),
      subject: typeof s.subject === "string" ? s.subject : "",
      state: typeof s.state === "string" ? s.state : "",
    };
  });
}

export async function loadSequenceRows(): Promise<SequenceRow[]> {
  const [sequences, nurtureDeals, newAccounts] = await Promise.all([
    db.emailSequence.findMany({ orderBy: { createdAt: "asc" } }),
    db.deal.findMany({ where: { stage: "nurture" }, select: { orgName: true } }),
    db.clientAccount.findMany({ where: { health: "new" }, select: { org: true } }),
  ]);
  const nurtureOrgs = nurtureDeals.map((d) => d.orgName);
  const newOrgs = newAccounts.map((a) => a.org);

  return sequences.map((s) => {
    let audienceLabel = "143 subscribers";
    let audienceMembers: string[] = [];
    if (s.audienceKind === "nurture") {
      audienceLabel = `${nurtureOrgs.length} nurture-stage leads — synced from the sales pipeline`;
      audienceMembers = nurtureOrgs;
    } else if (s.audienceKind === "newclients") {
      audienceLabel = `${newOrgs.length} new client${newOrgs.length === 1 ? "" : "s"} — added on conversion`;
      audienceMembers = newOrgs;
    }
    return {
      id: s.id,
      name: s.name,
      descr: s.descr,
      status: s.status,
      audienceKind: s.audienceKind,
      steps: parseSteps(s.steps),
      next: s.next,
      audienceLabel,
      audienceMembers,
    };
  });
}

// ── Testimonials ─────────────────────────────────────────────────────────

export type TestimonialRow = {
  id: string;
  org: string;
  who: string;
  stage: string;
  quote: string;
  detail: string;
};

export async function loadTestimonialRows(): Promise<TestimonialRow[]> {
  const rows = await db.marketingTestimonial.findMany({ orderBy: { createdAt: "asc" } });
  return rows.map((t) => ({ id: t.id, org: t.org, who: t.who, stage: t.stage, quote: t.quote, detail: t.detail }));
}

// ── Referrals ────────────────────────────────────────────────────────────

export type ReferrerRow = {
  id: string;
  name: string;
  kind: string;
  sent: number;
  leads: number;
  won: number;
  lastAtISO: string | null;
  note: string;
};

export type ReferralsData = {
  referrers: ReferrerRow[];
  openReferralPipeline: number; // Σ value of open deals with source "referral"
};

export async function loadReferralsData(): Promise<ReferralsData> {
  const [referrers, deals] = await Promise.all([
    db.referrer.findMany({ orderBy: { createdAt: "asc" } }),
    db.deal.findMany({
      where: { source: "referral", stage: { notIn: ["won", "lost"] } },
      select: { dealValue: true },
    }),
  ]);
  return {
    referrers: referrers.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      sent: r.sent,
      leads: r.leads,
      won: r.won,
      lastAtISO: r.lastAt ? r.lastAt.toISOString() : null,
      note: r.note,
    })),
    openReferralPipeline: deals.reduce((s, d) => s + (d.dealValue ?? 0), 0),
  };
}
