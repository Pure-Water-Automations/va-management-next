# UI + QOL Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax. Source catalog: `docs/2026-07-16-ui-qol-enhancement-catalog.md` (haiku fan-out, ~55 deduped ideas). This plan implements the high-value subset; the catalog stays as the backlog for the rest.

**Goal:** Ship the catalog's cross-cutting themes + quick wins: draft save/resume on both public funnels, at-a-glance status badges, list search/filter/bulk, timezone clarity, and a mobile pass — without touching the Skills Trial branch (its items ride separately, see "Trial rider" at the bottom).

**Architecture:** Everything is additive UI on existing client components — no schema changes, no new deps, no new API routes except one tiny op (`followup_done_bulk`). Two genuinely shared patterns get small reusable modules: `src/lib/use-draft.ts` (localStorage draft autosave hook, used by both public funnels) and nothing else — every other item is a local edit to the component that owns the screen. All styling uses the existing idiom (inline styles with the brand palette values, `Chip`/`ui.tsx` atoms, `page-head` shells) — do NOT introduce CSS modules or a styling lib.

**Branch/execution model:** work branch `feature/ui-qol-batch1` off `integration/ceo-on-dev`. Tasks are partitioned by FILE OWNERSHIP (haiku-fanout lesson: no two parallel workers may touch the same file). Each task block below = one dispatchable leg. **Every leg must first READ the regions it edits** — the catalog's file:line anchors came from read-only agents and may have drifted; adapt to what's actually there, keep the intent.

**Verification bar (every leg):** `npx tsc --noEmit` clean on touched files; the orchestrator runs `npm test` + `npm run build` + a browser walk of each changed screen at integration.

---

## Phase 1 — Quick wins + badges (all S, parallel-safe)

### Task 1A: Sales board — filter chips, stale badge, empty columns *(owns `src/components/SalesBoard.tsx`)*

- [ ] **Agreement-status quick-filter chips.** In the toolbar (next to the Board/List/Testimonials tabs, ~line 165), add three toggle chips — `Awaiting signature`, `Awaiting payment`, `Won` — each showing its live count (the same predicates the metric cards use: `agreement.sent && !signed`, `signed && !paid`, `stage === "won"`). Clicking one filters the board (extend the existing `filtered` useMemo that already handles `query`, ~line 118); clicking again clears. Active chip = navy fill, inactive = ghost, matching the view-tab styling.
- [ ] **Stale-deal age badge.** On `DealCard` (~line 312), compute days since the deal last moved: use `lastContactAt ?? createdAt` from `DealRow` (check what the row actually carries — `src/lib/reads/sales.ts` — and thread the field through if missing; it's a read-layer select addition, still this leg's files plus `src/lib/reads/sales.ts`, which no other leg touches). If ≥ 30 days and stage is not won/lost: render a small warm chip `⏱ Nd` beside the score chip. Warning palette (`#fff3d4`/`#966200` — the design-token warning values already used inline elsewhere).
- [ ] **Empty-column prompt.** In the column render (~line 193), when a stage column has zero cards, render a faded one-liner `No deals here yet` (13px, tertiary text color) so the Kanban doesn't read as broken.
- [ ] **Pre-validate email before opening the agreement modal.** Where the drawer's Send-agreement button opens the preview (`onPreview`, ~line 451), it already disables on `!deal.contactEmail`; ALSO add a cheap format check (`/.+@.+\..+/`) and a `title` tooltip "Add a valid contact email first" on the disabled state.
- [ ] Run: `npx tsc --noEmit`. Verify by loading `/sales` with one deal in each of the three filterable states.

### Task 1B: Follow-ups — search, custom snooze, bulk done *(owns `src/components/FollowUpsClient.tsx`… actual path `src/components/sales/FollowUpsClient.tsx`; plus ONE op added to `src/app/api/sales/console/route.ts`)*

- [ ] **Search box.** Above the bucket groups, a text input filtering all three buckets by case-insensitive substring on `title`+`detail` (extend the bucket `useMemo`, ~line 41). Placeholder: `Search follow-ups…`, same styling as the sales-board search.
- [ ] **Custom snooze.** Replace the fixed 7-day Snooze button with a small split control: clicking `Snooze` still does +7d (unchanged default), but a tiny `▾` beside it opens an inline row of options `+1d · +3d · +7d · +14d`. API: extend the existing `followup_snooze` op to accept an optional `days` number (default 7, clamp 1–60) in `src/app/api/sales/console/route.ts` (~line 63).
- [ ] **Bulk done.** A `Select` toggle in the header switches rows to checkbox mode; a sticky footer bar shows `N selected — Mark done`. New op `followup_done_bulk` in the same route file: `{ op, ids: string[] }` → `updateMany({ where: { id: { in: ids.slice(0,100) } }, data: { doneAt: new Date() } })`, same `allowUser` gate. Extend `tests/` only if a pure helper emerges; the op itself is verified in the browser walk.
- [ ] Run: `npx tsc --noEmit`.

### Task 1C: Client accounts — ceiling chip, cadence suggest, deep-link preset *(owns `src/components/sales/ClientAccountsClient.tsx`)*

- [ ] **Hours-ceiling chip on rows.** The drawer already computes `usagePct` and `AT_CEILING = 0.9`; reuse it in the table row's Hours cell — ≥ 0.8 renders an amber dot+`{pct}%` chip, ≥ 0.9 red-amber. Zero new logic, just surface it a level earlier.
- [ ] **Check-in cadence auto-suggest.** In the drawer's check-in section, compute a suggested date from `health`: good → +30d, growing → +21d, watch/new → +7d, and render `Suggested: <Mon DD> (based on <health>)` as muted text beside the Schedule check-in button. Display only — the button behavior is unchanged.
- [ ] **Drawer preset deep-link.** The page already passes `openAccountId` from `?account=`. Read one more param `?preset=note|checkin` (thread from `src/app/(app)/sales/clients/page.tsx` — same-leg file, nobody else owns it) and when present: `note` focuses the Log-an-interaction textarea, `checkin` scrolls to/highlights the Schedule check-in button. Best-effort focus, no errors if elements are absent.
- [ ] Run: `npx tsc --noEmit`.

### Task 1D: Recruitment + gate badges *(owns `src/app/(app)/recruitment/page.tsx`, `src/app/(app)/recruitment/gate/page.tsx`, `src/components/ApplicationDetails.tsx`)*

- [ ] **Referral + affiliation badges on candidate cards.** On the pipeline card header row (where `Applied <date>` was added this week), read `applicationJson.referralSource` and `applicationJson.ffwpuAffiliated` and render up to two small chips: `📌 <referralSource>` (truncate 28 chars) and `FFWPU` (navy-100 chip, only when `"yes"`). Missing keys (older applications) render nothing.
- [ ] **Duplicate-application flag.** After `getPipeline()`, group candidates client-side by lowercased email; where count > 1, render a `⚠ applied Nx` chip on each affected card. No collapsing UI, no new queries — just the flag.
- [ ] **Resume-link type badge.** In `ApplicationDetails`, where URL answers are auto-linkified, prefix a tiny label by domain: `drive.google.com` → `Drive`, `dropbox.com` → `Dropbox`, `docs.google.com` → `Docs`, else nothing. Keeps the raw link.
- [ ] Run: `npx tsc --noEmit`.

### Task 1E: Booking picker polish *(owns `src/app/discover/BookingPicker.tsx`)*

- [ ] **Crisp slot times.** `toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })` — kill the seconds.
- [ ] **Timezone line.** Above the slot list: `Times shown in <label> — your device says <Intl.DateTimeFormat().resolvedOptions().timeZone>`. The server already sends its `tzLabel`; this line makes a mismatch visible to the lead instead of silently wrong. (Full TZ *selector* is deliberately deferred — needs server-side slot re-rendering; backlog.)
- [ ] **Loading skeleton.** Replace the "Finding the best open times…" text with 3 shimmer rows (pure CSS animation inline, no lib).
- [ ] **Fully-booked copy upgrade.** Replace the dead-end line with: `We're fully booked right now — reply to your confirmation email with a few times that work and we'll fit you in.` (Waitlist capture = backlog; this at least gives an action.)
- [ ] Run: `npx tsc --noEmit`.

---

## Phase 2 — Draft save/resume on the public funnels

### Task 2A: Shared hook *(owns NEW `src/lib/use-draft.ts` + `tests/use-draft.test.ts`)*

- [ ] **Test first** (`node --import tsx --test tests/use-draft.test.ts`): the pure core, not the hook — `serializeDraft(key, state, now)` / `readDraft(key, raw, now, maxAgeMs)`: returns null on junk JSON, null past expiry (default 7 days), round-trips state, stamps `savedAt`.
- [ ] Implement `src/lib/use-draft.ts`: pure helpers + a `useDraft<T>(key: string, state: T, restore: (t: T) => void)` client hook — debounced (1.5s) `localStorage.setItem`, mount-time read returning `{ hasDraft, draftAgeLabel, resume, discard }`. SSR-safe (`typeof window` guards). No deps.

### Task 2B: Wire into `/discover` *(owns `src/app/discover/DiscoverClient.tsx`)*

- [ ] Persist `{ answers, idx }` under `pwa_discover_draft`. On mount with a draft: slide-down banner `Welcome back — resume where you left off?` with `Resume` / `Start over`. Clear the draft on successful submit. Also: **mobile multi-select grid** — the checkbox grid's `minmax(160px,1fr)` collapses awkwardly; make it `repeat(auto-fit, minmax(140px, 1fr))` and verify at 375px.
- [ ] Verify in browser at desktop + mobile viewport: answer 3 questions, reload, resume restores position; submit clears.

### Task 2C: Wire into `/apply` *(owns `src/app/apply/ApplyClient.tsx`)*

- [ ] Same pattern, key `pwa_apply_draft` (answers + question index). Plus the **mobile pass**: OK/nav buttons min-height 46px, card padding tightened under 480px (inline `matchMedia` or a tiny `useIsNarrow` local hook — do not add a breakpoint system), `(optional)` muted tag on `!q.required` questions.
- [ ] Verify: 20-question form survives a mid-way reload on mobile viewport; optional tags show only on optional questions.

---

## Phase 3 — Search/filter/sort + templates UX (M items, second wave)

### Task 3A: Recruitment pipeline sort/filter *(owns `recruitment/page.tsx` again — run AFTER 1D merges, same owner rule)*
- [ ] Sticky control row: sort `Applied ↓ | AI score | Name` + filter by stage (chips) and timezone (select built from distinct values). Client-side over the already-loaded pipeline; no server change. Bulk stage-move stays BACKLOG (needs a new guarded API + careful role checks — not this batch).

### Task 3B: Templates search + variable fill *(owns `src/components/sales/TemplatesClient.tsx`)*
- [ ] Full-text search input (title/purpose/body, ANDed with the category tab).
- [ ] **Variable-aware copy:** on Copy, scan for `[bracketed]` placeholders (the seeded templates' existing convention — do NOT invent `{{}}`); if any, open a small popover listing each placeholder with a text input (blank = keep placeholder), then copy the substituted body. Pure client-side; test the substitution helper in `tests/`.

### Task 3C: Trial queue + review polish — **SKILLS TRIAL BRANCH, see rider below. Not in this batch.**

---

## Phase 4 — Verify + ship

- [ ] Orchestrator: `npm test`, `npm run build`, then browser-walk each touched screen (sales board chips/badges, follow-ups search+bulk, clients chips, recruitment badges, `/discover` resume + booking polish, `/apply` resume + mobile) at desktop and 375px.
- [ ] Design-consistency eyeball: new chips/banners against existing ones (palette values, radii, `Chip` reuse).
- [ ] Merge `feature/ui-qol-batch1` → `integration/ceo-on-dev`, deploy dev (`./deploy.sh dev integration/ceo-on-dev`), live-verify `/discover` + `/apply` public pages, journal clean. Prod untouched.

---

## Trial rider (build on `feature/skills-trial-v2`, sequenced AFTER its hardening blockers)

The trial screens' wins — timer-paused trust state, active-time budget bar, deadline countdown, post-submit auto-nav, blocker reassurance, queue ownership/staleness + filters, evidence-count click-to-filter, live pass-bar preview, thin-evidence warnings — are all catalogued with anchors. They must NOT ship before `2026-07-16-trial-and-sales-hardening.md` items 1–4 (mission approval path, error-message plumbing, reviewer alerts, AI summary wire-up): several (pass-bar preview, evidence filtering) touch the exact components the hardening pass rewires. Fold them into that branch's work as a Phase-2 when it gets the go.

## Explicit backlog (catalogued, deliberately not in this batch)
Bulk stage-move (recruitment + sales board) · timezone *selector* with server-side slots · waitlist capture · resume-link HEAD-check validation · back/edit answers mid-funnel · win-celebration toast · keyboard 1–5 rubric scoring · per-dimension rationale · peer benchmarks · calendar export.

**Estimate:** Phase 1 ≈ one fanout wave (5 legs, all S) · Phase 2 ≈ half day · Phase 3 ≈ half day. **Risk:** low — additive UI, no schema, one tiny API op; the one sharp edge is file ownership (1D and 3A share a file → strictly sequential).
