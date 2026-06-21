import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { loadSettings } from "@/lib/settings";
import { maybeConvertDeal } from "@/lib/sales/deal";

const STRIPE_API = "https://api.stripe.com/v1";

function stripeKey(): string | null {
  return env.STRIPE_SECRET_KEY ?? null;
}

/** Minimal form-encoded Stripe REST call (dependency-free). Throws on non-2xx. */
async function stripe(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const key = stripeKey();
  if (!key) throw new Error("Stripe is not configured (STRIPE_SECRET_KEY unset).");
  const res = await fetch(`${STRIPE_API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const json = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    const msg = (json.error as { message?: string } | undefined)?.message ?? `Stripe ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

/**
 * Kick off payment after the agreement is signed. Best-effort:
 * - retainer/project with a known value → create a Stripe customer + invoice and
 *   send it; payment confirmation arrives via the webhook (`invoice.paid`).
 * - hourly (or Stripe unconfigured) → record that a saved-card authorization /
 *   manual payment confirmation is pending. Never throws to the caller.
 */
export async function onAgreementSigned(dealId: string): Promise<void> {
  const agreement = await db.clientAgreement.findUnique({ where: { dealId }, include: { deal: true } });
  if (!agreement) return;
  const deal = agreement.deal;
  const billing = (agreement.billingType || deal.billingType || "").toLowerCase();
  const settings = await loadSettings();
  const currency = (settings.get("stripe_currency")?.trim() || "usd").toLowerCase();

  if (!stripeKey()) {
    await logActivity({
      source: "sales",
      eventType: "payment_pending_manual",
      summary: `${deal.orgName} signed — Stripe unconfigured; awaiting manual payment confirmation`,
    });
    return;
  }

  if (!deal.contactEmail) return;

  // Ensure a Stripe customer.
  let customerId = agreement.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe("/customers", {
      email: deal.contactEmail,
      name: deal.orgName,
      "metadata[dealId]": dealId,
    });
    customerId = String(customer.id);
  }

  const data: { stripeCustomerId: string; stripeInvoiceId?: string } = { stripeCustomerId: customerId };

  if (billing !== "hourly" && typeof deal.dealValue === "number" && deal.dealValue > 0) {
    const amountCents = Math.round(deal.dealValue * 100);
    await stripe("/invoiceitems", {
      customer: customerId,
      amount: String(amountCents),
      currency,
      description: `${agreement.packageName || deal.packageName || "Services"} — first payment`,
    });
    const invoice = await stripe("/invoices", {
      customer: customerId,
      collection_method: "send_invoice",
      days_until_due: "7",
      "metadata[dealId]": dealId,
    });
    await stripe(`/invoices/${String(invoice.id)}/send`, {});
    data.stripeInvoiceId = String(invoice.id);
  }

  await db.clientAgreement.update({ where: { id: agreement.id }, data });
  await logActivity({
    source: "sales",
    eventType: "payment_initiated",
    summary: `${deal.orgName} — Stripe ${data.stripeInvoiceId ? "invoice sent" : "customer created (hourly auth pending)"}`,
  });
}

/**
 * Mark a deal's agreement paid (from the Stripe webhook or a manual fallback),
 * then advance the deal to Won + create the client if also signed. Idempotent.
 */
export async function markAgreementPaid(
  dealId: string,
  opts?: { stripeInvoiceId?: string; stripeSubscriptionId?: string; via?: string },
) {
  const agreement = await db.clientAgreement.findUnique({ where: { dealId }, include: { deal: true } });
  if (!agreement) throw new Error("No agreement for this deal.");
  if (agreement.paidAt) {
    await maybeConvertDeal(dealId).catch(() => {});
    return agreement;
  }

  const updated = await db.clientAgreement.update({
    where: { id: agreement.id },
    data: {
      paidAt: new Date(),
      status: "paid",
      stripeInvoiceId: opts?.stripeInvoiceId ?? agreement.stripeInvoiceId,
      stripeSubscriptionId: opts?.stripeSubscriptionId ?? agreement.stripeSubscriptionId,
    },
  });

  await logActivity({
    source: "sales",
    eventType: "payment_received",
    severity: "success",
    summary: `${agreement.deal.orgName} — payment confirmed${opts?.via ? ` (${opts.via})` : ""}`,
  });

  await maybeConvertDeal(dealId).catch(() => {});
  return updated;
}

/**
 * Apply a verified Stripe webhook event. Resolves the deal from event metadata or
 * the customer, then marks paid. Returns a short status for the route to log.
 */
export async function applyStripeEvent(event: {
  type: string;
  data: { object: Record<string, unknown> };
}): Promise<string> {
  const obj = event.data.object;
  const PAID_EVENTS = new Set(["invoice.paid", "invoice.payment_succeeded", "checkout.session.completed", "payment_intent.succeeded"]);
  if (!PAID_EVENTS.has(event.type)) return `ignored ${event.type}`;

  const metadata = (obj.metadata as Record<string, string> | undefined) ?? {};
  let dealId: string | undefined = metadata.dealId;

  if (!dealId) {
    const invoiceId = typeof obj.id === "string" && event.type.startsWith("invoice") ? obj.id : undefined;
    const customerId = typeof obj.customer === "string" ? obj.customer : undefined;
    const found = await db.clientAgreement.findFirst({
      where: { OR: [invoiceId ? { stripeInvoiceId: invoiceId } : {}, customerId ? { stripeCustomerId: customerId } : {}].filter((c) => Object.keys(c).length) },
      select: { dealId: true },
    });
    dealId = found?.dealId;
  }

  if (!dealId) return `no matching deal for ${event.type}`;
  await markAgreementPaid(dealId, { via: event.type, stripeInvoiceId: typeof obj.id === "string" ? obj.id : undefined });
  return `paid ${dealId}`;
}
