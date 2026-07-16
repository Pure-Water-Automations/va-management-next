# Agreement → Payment → Client Automation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close the "still manual past confirm" feedback from the Jul 16 sync — with an important correction from code audit.

**What the audit actually found (changes the plan):** sign → pay → client-creation is ALREADY automatic in the happy path: signing auto-triggers `onAgreementSigned` (payment kickoff) and `maybeConvertDeal`; a paid webhook auto-converts; "Create client"/"Mark paid" buttons are fallbacks. The demo FELT manual because:
1. **Stripe is in mock mode in every environment** — `STRIPE_MODE=live` + `STRIPE_SECRET_KEY` are set nowhere, so "payment" is a simulation (`payment.ts:55` marks paid instantly). No environment does a real charge today.
2. **Hourly deals are never invoiced at all** (`payment.ts:74` skips hourly) — always manual "Mark paid".
3. **Failures are silent** — `maybeConvertDeal` calls are wrapped in `.catch(() => {})` (`agreement.ts:251`, `payment.ts:132`); a stuck deal is only noticed by staring at the board.
4. **The 9-item onboarding checklist is mostly decorative** — only `intakeReceived` (public intake form) and `portalAccessGranted` (terminal complete action) have real signals; the other 7 are manual checkboxes, and `isOnboardingChecklistComplete()` exists but is never enforced by the complete action.

So the plan = turn on real payments + wire real signals into onboarding, not "build automation that already exists."

---

### Phase A — Real Stripe (config + hardening, small code)

- [ ] **Prod config (human step + Justin's explicit go — money movement):** set `STRIPE_MODE=live`, `STRIPE_SECRET_KEY` (restricted key per the stripe-api shared-secret convention), `STRIPE_WEBHOOK_SECRET`; register the webhook endpoint `https://team.purewaterautomations.com/api/stripe/webhook` in the Stripe dashboard. Dev box stays mock.
- [ ] Surface payment state honestly on the board: chip shows "Mock payment (demo)" vs "Invoice sent — awaiting payment" vs "Paid via Stripe" (the `via` string already exists on `markAgreementPaid`; display it).
- [ ] **Alert on silent failure:** replace the two `.catch(() => {})` around `maybeConvertDeal` with catch → `logActivity(severity:"error")` + notification to the deal owner ("Deal signed+paid but client creation failed — click Create client"). Smallest change that kills the stuck-deal class.

### Phase B — Hourly deals stop being manual

- [ ] Hourly = Stripe **SetupIntent** at signing (card saved, no charge) + first-period invoice generated from actual hours later, OR minimum-retainer first invoice — **product decision needed from Justin** (proposed: save card at signing, charge first invoice manually from the payroll cycle until the bookkeeping project defines the metering source).
- [ ] Until decided: keep manual Mark-paid for hourly but add a due-reminder follow-up (auto-`SalesFollowUp` kind "payment", 3 days after signing — the sales-suite tables shipped today make this a 5-liner in `onAgreementSigned`).

### Phase C — Onboarding checklist gets real signals (each independently shippable)

| Flag | Wire to | Size |
|---|---|---|
| `vaAssigned` | `ClientAssignment.upsert` in `team.ts:94` flips it for that org | XS |
| `driveFolderCreated` | create per-client Drive folder in `convertDealToClient` (Drive client + folder-setting already exist from signed-contract delivery, `agreement.ts:217`) | S |
| intake send | call `sendIntakeForm(org.id)` inline in `convertDealToClient` (today it's a manual HR button) | XS |
| `portalAccessGranted` | grant at convert/intake time instead of onboarding-complete (User/ClientMembership creation logic already exists in `client-onboarding.ts:61-74`) | S — product call: earlier portal access OK? |
| `onboardingCallBooked/Done` | mirror the discovery-call booking pattern for onboarding calls | M — defer unless asked |
| `commsCadenceSet`, `firstWeekPriorities`, `kickoffRecapSent` | no backing concept exists — leave manual, they're judgment steps | — |

- [ ] Enforce the gate: `markClientOnboardingComplete` requires `isOnboardingChecklistComplete()` (the helper exists, is tested, and is called by nothing) — with an admin override + reason field.

### Verify

- [ ] Stripe test-mode E2E on dev: sign → invoice email → test-card pay → webhook → deal auto-converts → intake auto-sent → checklist flags flip as their signals fire.
- [ ] Kill-switch check: webhook 503s without secret; mock mode untouched on dev.

**Sequencing:** A anytime (config + 2 small code changes); B blocked on one product decision; C items are independent — `vaAssigned` + intake-send + failure-alerting are the highest value-per-line in the whole handoff doc.

**Estimate:** A ~half day, B ~1 day post-decision, C ~1 day for the XS/S rows. **Risk:** A touches money — live-mode flip needs your explicit go per the money-movement rule; everything else is low.
