# Negotiation Calculator (Sales-Call Margin Tool) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** In-call tool for sales reps (team-sync ask): enter the client's numbers, get an AI-suggested ideal midpoint price that protects PWA's profit margin — grounded in real business margin data, not vibes.

**Status: DESIGN-STAGE PLAN — needs one product decision from Justin before build** (see Open Questions). Phased, not task-level, on purpose.

**Architecture:** New `/sales/calculator` page (SALES nav, gated by `requireSalesUser`). Deterministic math core (pure TS, tested) computes cost floor and margin bands from real inputs; the AI layer (NVIDIA NIM per the house default-backend convention — free tier, internal tool) only NARRATES and suggests negotiation framing around the computed numbers. Never let the LLM do the arithmetic.

**Grounding data available in-app today:**
- Package ladder + prices: `src/lib/sales/packages.ts` (Hourly $10/hr … Ocean Enterprise $4,700/552h)
- VA cost side: `CompensationRole.hourlyRate` per tier (Prisma) — real per-hour VA cost
- `admin_cost_rate` setting (already exists — used by the discovery funnel's cost-reveal)
- CFO snapshot (margin trend context) — optional enrichment

---

### Phase 1 — Deterministic core

- Pure module `src/lib/sales/negotiation.ts`: inputs `{ clientBudget, hoursNeeded, vaTier, adminOverheadRate }` → outputs `{ costFloor, breakEven, targetMargin(setting, default e.g. 40%), idealPrice, midpoint(clientBudget, idealPrice), nearestPackage (via pkgByName ladder), marginAtMidpoint }`. Full unit tests — this is the trust anchor.
- `negotiation_target_margin` Setting (admin-editable) rather than a hardcoded constant.

### Phase 2 — Calculator UI

- `/sales/calculator`: left = inputs (budget, hours, VA tier select, package preselect), right = live outputs: cost floor, break-even, ideal price, suggested midpoint, margin gauge at each price, nearest-package suggestion ("this maps to River — $1,400/mo"). Design-system components (same card/chip idiom as the sales screens).
- Every number visibly derived — reps must be able to defend the price on the call ("our floor is X because tier cost × hours + overhead").

### Phase 3 — AI negotiation coach (NIM)

- "Coach" panel: sends the COMPUTED numbers + lead context (org, package interest, discovery notes if a `?deal=` is linked) to NIM (DeepSeek/Llama via the shared key, `/etc/secondbrain/nvidia.env` on the box); returns talking points, anchor/concession ladder, and how to frame the midpoint. Response streamed; clearly labeled as suggestion.
- Guard: if NIM unreachable, calculator still fully works (math core is the product; coach is garnish).

### Phase 4 — Deal integration

- Open from the deal drawer (`/sales/calculator?deal=<id>` prefills budget/package from the deal); "Save to deal" writes the agreed numbers into the deal's notes/`handoffSummary`.

---

### Open Questions (blocking Phase 1 sign-off)

1. **Target margin:** one company-wide % or per-package/per-tier? (Setting default proposed: 40% — confirm the real number.)
2. **Whose margin data:** is `CompensationRole.hourlyRate` + `admin_cost_rate` the right cost basis, or does the QuickBooks-side margin data (bookkeeping project) need to feed this eventually? (Proposed: v1 = in-app rates; QBO integration = post-bookkeeping-project.)
3. Reps see cost floors = reps see VA pay rates indirectly. OK, or should the tool show margins only as bands without exposing the floor math to non-admin?

**Estimate after sign-off:** Phases 1-2 ~1 day, Phase 3 ~half day, Phase 4 ~half day. **Risk:** low technically; the open questions are product/pricing policy, not code.
