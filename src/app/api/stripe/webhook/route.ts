import { env } from "@/lib/env";
import { verifyStripeSignature } from "@/lib/sales/stripe-webhook";
import { applyStripeEvent } from "@/lib/sales/payment";
import { logActivity } from "@/lib/activity";

// PUBLIC — Stripe posts here; must be on the Cloudflare Access bypass.
// Disabled (503) unless STRIPE_WEBHOOK_SECRET is set; rejects unverified events.
export async function POST(request: Request): Promise<Response> {
  const secret = env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return Response.json({ ok: false, error: "Webhook disabled" }, { status: 503 });

  const raw = await request.text();
  const sig = request.headers.get("stripe-signature");
  if (!verifyStripeSignature(raw, sig, secret)) {
    return Response.json({ ok: false, error: "Invalid signature" }, { status: 400 });
  }

  let event: { type: string; data: { object: Record<string, unknown> } };
  try {
    event = JSON.parse(raw);
  } catch {
    return Response.json({ ok: false, error: "Bad JSON" }, { status: 400 });
  }

  try {
    const status = await applyStripeEvent(event);
    return Response.json({ ok: true, status });
  } catch (err) {
    await logActivity({
      source: "sales",
      eventType: "stripe_webhook_error",
      severity: "error",
      summary: `Stripe webhook ${event.type} failed: ${err instanceof Error ? err.message : err}`,
    }).catch(() => {});
    return Response.json({ ok: false, error: "Processing failed" }, { status: 500 });
  }
}
