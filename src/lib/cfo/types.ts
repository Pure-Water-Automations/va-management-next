// AI CFO snapshot payload — the frozen contract shared by the ingestion endpoint
// and the /ceo renderer. Written by the Mac-side analyst.js / cfo-review skill.
// Kept loose (optional-tolerant) on read: the renderer must not crash on a
// partial payload from an older analyst version.

export type Severity = "Critical" | "High" | "Medium";
export type Priority = "Critical" | "High" | "Medium" | "Watch";

export type CfoKpis = {
  revenue_mtd: number;
  revenue_mtd_prior: number;
  revenue_qtd: number;
  revenue_qtd_prior: number;
  gross_margin_pct: number | null;
  cash_on_hand: number;
  dso_days: number | null;
  total_ar: number;
};

export type AgingBucket = { bucket: string; amount: number; pct_of_ar: number };
export type OverdueInvoice = {
  invoice_no: string;
  customer: string;
  due_date: string;
  days_overdue: number;
  balance: number;
  priority: Priority;
};
export type CustomerRisk = {
  customer: string;
  exposure: number;
  pct_of_ar: number;
  oldest_invoice_days: number;
  flags: string[];
};
export type Concentration = { top1_pct: number; top5_pct: number; single_over_20pct: boolean };
export type CollectionPriority = {
  customer: string;
  amount: number;
  oldest_days: number;
  score: number;
  action: string;
};
export type CashForecast = { horizon_days: number; expected_collection: number };
export type CfoAlert = { id: string; type: string; severity: Severity; message: string; ref: string };

export type CfoDerived = {
  computed_at: string;
  source_generated_at?: string | null;
  currency?: string;
  kpis: CfoKpis;
  ar_aging: AgingBucket[];
  overdue_invoices: OverdueInvoice[];
  customer_risk: CustomerRisk[];
  concentration?: Concentration;
  collection_priorities: CollectionPriority[];
  cash_forecast: CashForecast[];
  alerts: CfoAlert[];
};

export type CfoAction = { action: string; owner: string; timeframe: string; rationale?: string };

// The whole POST body / stored payload.
export type CfoSnapshotPayload = {
  computed_at: string;
  derived: CfoDerived;
  narrative: string | null;
  actions: CfoAction[];
};

// Minimal structural validation for the ingestion endpoint. Returns an error
// string, or null if the body is a usable snapshot. Deliberately shallow — the
// contract owner is the analyst; we only reject bodies the renderer can't use.
export function validateSnapshot(body: unknown): { ok: true; value: CfoSnapshotPayload } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "body must be an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.computed_at !== "string" || !b.computed_at.trim()) return { ok: false, error: "missing computed_at" };
  const d = b.derived as Record<string, unknown> | undefined;
  if (!d || typeof d !== "object") return { ok: false, error: "missing derived" };
  if (!d.kpis || typeof d.kpis !== "object") return { ok: false, error: "missing derived.kpis" };
  if (!Array.isArray(d.ar_aging)) return { ok: false, error: "missing derived.ar_aging" };
  const narrative = b.narrative == null ? null : typeof b.narrative === "string" ? b.narrative : null;
  const actions = Array.isArray(b.actions) ? (b.actions as CfoAction[]) : [];
  return { ok: true, value: { computed_at: b.computed_at, derived: d as unknown as CfoDerived, narrative, actions } };
}
