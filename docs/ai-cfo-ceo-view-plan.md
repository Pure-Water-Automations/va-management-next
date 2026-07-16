# AI CFO — Implementation Plan

**Goal:** CFO-level financial monitoring for Pure Water Automations, adapted from the "AI CFO" pattern (Claude Skill = judgment layer, QuickBooks = source of truth, analyst script = analysis engine — Quadratic skipped, decided 2026-07-15). Dashboard surfaces as a **CEO view inside the VA Management Console** (referenced from the Notion "Justin Leadership Dashboard" page). Alerts flow into the **morning brief** only.

**Source inspiration:** "I Built an AI CFO That Monitors The Business 24/7 in Claude" (Luke Finance, Jul 2026). Core methodology adopted: Orient → Find red flags → Translate to impact → Connect dots → Prioritize ruthlessly → Decide & direct.

---

## Architecture

```
Justin's Mac (has QBO creds + mirror)                    VPS (IONOS dev / Hostinger prod)
┌──────────────────────────────────────┐               ┌──────────────────────────────────┐
│ quickbooks-mcp mirror (existing)     │               │ va-management-next               │
│   └─ analyst.js (NEW, Phase 1)       │               │   POST /api/cfo/snapshot (NEW)   │
│        derives CFO tables            │──HTTPS push──▶│   Postgres: CfoSnapshot row      │
│   cfo-review skill (NEW, Phase 2)    │  bearer token │   /ceo route (NEW): renders      │
│        adds executive narrative      │               │   latest snapshot                │
│   night worker (NEW, Phase 3)        │               └──────────────────────────────────┘
│        alerts → morning_context.md   │
└──────────────────────────────────────┘
```

Why push-from-Mac instead of the app pulling QBO directly: QBO OAuth creds + the read-only mirror already live on the Mac (`SecondBrain/tools/quickbooks-mcp/`). No new credential surface on the boxes; the app only ever receives derived, read-only JSON. QuickBooks is never written to.

---

## Phase 1 — Analyst layer (Mac, `tools/quickbooks-mcp/analyst.js`)

Node script beside the existing mirror builder. Reads mirror JSON (fall back to `qbo_*` live calls only if mirror is stale), computes derived tables the mirror doesn't have:

- **Executive KPIs:** revenue (MTD/QTD vs prior), gross margin if derivable, cash on hand, DSO, total A/R.
- **A/R aging buckets:** current / 1–30 / 31–60 / 61–90 / 90+, each with $ and % of A/R.
- **Overdue invoice monitor:** invoice #, customer, due date, days overdue, balance, priority (Critical ≥90d, High ≥60d, Medium ≥30d, Watch otherwise).
- **Customer risk ranking:** exposure $, % of A/R, oldest invoice age, concentration check — flag any single customer >20% of A/R and top-5 share.
- **Collection priorities:** "chase the dollars, not the invoices" — sorted by $ × age, one recommended action per account (payment plan / escalate / hold credit).
- **Cash collection forecast:** expected collections next 30/60/90 days from invoices × historical pay-rate per bucket (simple rates hardcoded first; refine later from payment history).
- **Alert feed:** threshold breaches (new 90+ invoice, concentration >20%, aging bucket jump >X% week-over-week, cash below floor). Severity Critical/High/Medium.

Output: `mirror/cfo_derived.json` (all tables + computed_at) and a compact `## CFO Derived` section appended into `quickbooks_index.md` so any agent session can read it locally.

Run: manual `node analyst.js`, plus hooked into whatever launchd job refreshes the QBO mirror (runs after sync).

## Phase 2 — `cfo-review` skill (judgment layer)

`SecondBrain/agents/agent-instructions/skills/cfo-review/SKILL.md`, registered in SKILLS.md, symlinked to `~/.claude/skills/` per convention.

Trigger phrases: "run CFO review", "how are we doing financially" (deep version — the existing quickbooks-mcp entry stays the quick answer), "CFO dashboard", "financial risks".

Skill flow (local-first per house convention):
1. Read `mirror/cfo_derived.json`; if `computed_at` >24h old, run `node analyst.js` first.
2. Apply the CFO review methodology to the derived tables — the skill's job is **judgment, not math**: identify the 2–3 findings that matter, challenge unrealistic forecast numbers, connect DSO/concentration/liquidity dots, name a "so what" and "now what" for every material finding.
3. Risk frameworks encoded in the skill: collection/bad-debt, liquidity, customer concentration, forecast realism, credit-policy drift. Every risk gets exposure $, "if unaddressed" consequence, and mitigation.
4. Recommended actions table with **owner** (Justin/CEO, bookkeeper, collections owner) and **timeframe** (this week / this month).
5. Write outputs: (a) executive narrative + tables as `intelligence/reports/cfo/cfo-review-YYYY-MM-DD.md`; (b) merged JSON payload (`derived tables + narrative + actions`) pushed to the VA-manager endpoint (Phase 4) via `curl` with the bearer token from `tools/quickbooks-mcp/.env`.
6. Hard rule stated in skill frontmatter: read-only against QBO; money actions are recommendations only; never auto-send anything.

## Phase 3 — Morning-brief alerts (24/7 part)

- Extend the nightly-intelligence run (or the mirror-sync launchd job) with a small step: run `analyst.js`, diff the alert feed against `intelligence/state/cfo_alerts_seen.json`, append **new** alerts to the CFO section of `morning_context.md`. No Telegram, no email — morning brief only (decided 2026-07-15).
- Alert dedupe by (type, invoice/customer, severity) so the brief only ever shows new or escalated items.
- Full CFO review stays on-demand (skill) — the nightly job is alerts-only, cheap, no LLM call needed (pure thresholds).

## Phase 4 — CEO view in VA Management Console

Repo: this repo (`va-management-next`). Follow the house dual-env flow: build on a feature branch (e.g. `feature/ceo-cfo-view`), prove on `dev-team.pwasecondbrain.uk`, merge to `main` + `./deploy.sh prod`.

**a) Ingestion endpoint** — `POST /api/cfo/snapshot`
- Auth: static bearer token (`CFO_SNAPSHOT_TOKEN` in `shared/.env.production` on both boxes; same token in the Mac-side `.env`). Not NextAuth — machine-to-machine.
- Body: the merged JSON from Phase 2 (derived tables + narrative + actions + computed_at).
- Stores one row in a new `CfoSnapshot` Prisma model: `id, createdAt, computedAt, payload Json`. Keep last N=60 rows (trend history), prune older.
- Validation: reject if payload missing `computed_at` or core tables; size cap.

**b) CEO route** — `/ceo` under `(app)`
- Access: **new `isCeo()` helper in `src/lib/auth/roles.ts`** gated to Justin's account (email allowlist env `CEO_EMAILS`, default `okamotomiak@gmail.com`) — no new Prisma Role enum value needed; TESTER/admin does NOT get it by default. Nav link visible only when `isCeo()`.
- Renders the latest `CfoSnapshot` with PWA design system components:
  - Headline story (2–3 sentence narrative from the skill)
  - Top decisions needed (the "decide & direct" items)
  - Executive KPI row (revenue, margin, cash, DSO) with status colors
  - A/R aging table + overdue invoice monitor
  - Customer risk ranking (concentration flags)
  - Collection priorities + 30/60/90 cash forecast
  - Alert feed (severity-tagged)
  - Recommended actions (owner + timeframe)
  - Staleness banner if `computedAt` >48h old ("data as of …, run a CFO review to refresh")
- Snapshot history dropdown (compare to last week) — v1 can just show latest; trend sparkline from prior snapshots is a fast follow.

**c) Notion Leadership Dashboard link** — add a link block on the Notion "Justin Leadership Dashboard" page (`372063b66bf181e395b0ffcab5e49bfa`) pointing at `https://team.purewaterautomations.com/ceo`. One-line manual step, no sync needed.

## Build order & effort

| Step | Where | Effort | Depends on |
|---|---|---|---|
| 1. `analyst.js` + derived JSON | Mac, quickbooks-mcp | ~half session | existing mirror |
| 2. `cfo-review` skill | Mac, skills dir | ~half session | 1 |
| 3. Nightly alerts → morning brief | Mac, nightly-intelligence | ~30 min | 1 |
| 4a. Snapshot endpoint + Prisma model | this repo | ~half session | — (parallel w/ 1–3) |
| 4b. `/ceo` view | this repo | ~1 session | 4a; real data needs 1–2 |
| 4c. Notion link | Notion | 2 min | 4b live on prod |

Phases 1–2 alone already deliver on-demand CFO reviews in any Claude session; 3–4 add the always-on monitoring and the visual surface.

## Non-goals / guardrails

- No Quadratic subscription (decided 2026-07-15).
- No writes to QuickBooks, ever — this whole system is read-only against the books.
- No auto-sent collection emails/messages — recommendations name an owner; humans send.
- No QBO credentials on either VPS box — only derived JSON crosses the wire.
- Prisma migrations follow the house rule: `prisma migrate diff --script` + `migrate deploy` (never interactive `migrate dev`).
