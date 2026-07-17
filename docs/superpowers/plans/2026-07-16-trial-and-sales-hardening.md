# Skills Trial V2 + Sales Suite — Hardening Plan (from end-to-end testing)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans when a section gets the go. Every item below was found by driving the real flow on 2026-07-16 (candidate/recruiter/HR for the trial; prospect/rep/HR-closing for sales). Severity + evidence (file:line) included so items can be picked off independently.

**Two items are already DONE** (shipped on branch `pwaos-fix/sales-polish-2026-07-16`, commit `a6e837e`, verified live) — listed at the bottom under "Completed".

**Branch reality:** Sales items are on the merged trunk (`integration/ceo-on-dev` → dev-team). Trial items are on the unmerged `feature/skills-trial-v2` (live only at recruit.pwasecondbrain.uk). Keep the two workstreams on separate branches.

---

## A. Skills Trial V2 — blockers before real candidates

The full loop works end-to-end (onboarding → 9 missions → recruiter rubric gate → HR contract → VA row all proven live). These are the gaps that would confuse or block real users. A task chip (`task_e223543d`) already tracks A1–A5.

### A1 (HIGH) — 5 of 7 mission kinds have no approval path
**Evidence:** `src/lib/trial/engine.ts:467` hard-codes `finalStatus = "SUBMITTED"` for `tour/branch/sop/meet/reflect`; only `learn` (`gradeLearn`) and `sim` (AI) ever set `APPROVED`. `markEvidenceReadyIfComplete` (`engine.ts:444`) needs `count(status != APPROVED) === 0`, so it can never fire for a real trial → the "N/9 approved" counter never reaches 9/9, `trainingReadyForReview` never auto-sets, `EVIDENCE_READY` never logs, and the reviewer is never signalled a candidate is done.
**Also:** the `revision` gate decision (`src/app/api/trials/review/validate.ts:72`) resets no mission and messages nothing → candidate reopens to "You're all caught up" (`Home.tsx`) with no idea what to fix.
**Decision needed (Justin):** two viable models —
  (a) **auto-approve on submit** for the non-graded kinds (treat the whole-week rubric gate as the only human judgment), OR
  (b) **add a per-step approve/return control** to `ReviewPanel` (a real reviewer action + API route).
Recommendation: (a) — matches how the reviewer already scores (reads the week's evidence, not per-step), smallest change, and fixes the counter + evidence-ready signal at once. Then make `revision` reset the targeted missions to `NEEDS_REVISION` + send the candidate a message with the reviewer's note.
**Tasks:** engine change per chosen model; wire `revision` to reset missions + notify; verify the counter reaches 9/9 and evidence-ready fires.

### A2 (HIGH) — candidate errors show raw codes; no outcome screen
**Evidence:** `src/app/api/trials/_route.ts:24-27` returns `{error: <CODE>, message: <friendly>}`; the client parser `src/app/track/[token]/mission-control/lib.ts:31-36` reads `json.error` (the code) and ignores `json.message`. So candidates see `VALIDATION` / `TRIAL_NOT_OPEN` / `MISSION_NOT_FOUND` instead of authored copy. Same parser drops `completionStatus`, so a decided candidate sees a generic "workspace unavailable" instead of a pass/not-selected outcome.
**Tasks:** parser reads `json.message`; add a completion/outcome screen keyed on `completionStatus`.

### A3 (MEDIUM) — reviewer notifications dead
**Evidence:** `src/lib/trial/notify.ts` is 100% uncalled (grep: zero callers) — reviewers get no alert on evidence-ready or escalation and must poll `/recruitment/gate`. Its links also point at a dead `/admin/trials/{trialId}` (real route is `/recruitment/gate/trial/{candidateId}`). `TRIAL_REVIEWER_EMAILS` + `SYSTEM_EMAIL_FROM` are unset on the recruit box.
**Tasks:** call the evidence-ready + escalation notifiers from the engine (tie A3 to A1's evidence-ready firing); fix the review URL to the candidateId route; set the two env vars on the box.

### A4 (MEDIUM) — reviewer AI evidence summary never wired
**Evidence:** `buildReviewerSummary` (`src/lib/trial/ai/reviewer-summary.ts`) has zero callers; `src/app/(app)/recruitment/gate/trial/[candidateId]/page.tsx:97` hard-codes `aiSummary = null`. So AI-suggested rubric scores + the "scoring pauses during escalation" fairness rule (only consumed in that function) never appear — the reviewer scores from the raw timeline only. (This is the "AI summary not yet compiled" seen in the console.)
**Tasks:** wire `buildReviewerSummary` into the page (it degrades to null gracefully if the AI call fails, so no new failure surface).

### A5 (LOW / scope decision) — no PII / prompt-injection layer
**Evidence:** `src/lib/trial/ai/guardrails.ts` only does escalation-keyword routing + banned-phrase output stripping. Candidate submission text is concatenated into the model prompt verbatim (`evaluate.ts:109-116`); "never reveal hidden targets" is a system-prompt instruction, not enforced. No PII redaction.
**Decision needed:** acceptable v1 scope, or add an input-sanitization pass? Recommendation: acceptable for a trusted-applicant pilot; add before any scale-up. Document the decision either way.

### A6 (LOW) — dead code cleanup
Delete confirmed-uncalled code so the next reader isn't misled: `src/lib/trial/schedule.ts` (all fns uncalled — the real worker is `worker/trial-scheduler.ts`), the dead `notify.ts` fns not revived by A3, `disclosureTag` (`guardrails.ts:66`), `evaluateSopSubmission`/`evaluateOtherSubmission` (`evaluate.ts:127-165`). Also note the dead `Deal.reviewNeeded`/`reviewApproved`-equivalent on the trial side if any. Purely hygiene.

### A7 (deploy readiness, no code) — before real candidates on the recruit box
- `OPENROUTER_API_KEY` **is** set on the box (AI works there); `.env.example` should document `OPENROUTER_API_KEY` + `TRIAL_AI_MODEL` so a fresh env isn't a mystery.
- Confirm `npm run seed:skills-trial` has run on the target DB (else first candidate login throws `NO_ACTIVE_PROGRAM`).
- Know the candidate **invite email bypasses** the `TRIAL_EMAILS_ENABLED` kill switch (`recruitment.ts:668` sends directly) — approving a candidate on the box sends a real email now.
- Set who holds `isGateReviewer` on the box.

---

## B. Sales Suite — polish (flow is production-ready; these are edges)

The full funnel works end-to-end (prospect `/discover` → auto-score → self-book → call notes → agreement → sign → mock-pay → convert → client + account all proven live). These are refinements.

### B1 (MEDIUM) — booking needs windows configured, silently "fully booked" otherwise
**Evidence:** `/discovery/[token]` shows "We're fully booked — we'll email you" when `discovery_booking_windows` is empty (graceful, but invisible to the admin). The slot engine (`src/lib/actions/discovery-booking.ts:44-55`) reads per-rep windows from Settings.
**Tasks:** add an admin surface (or a banner on `/sales`) that flags "no booking windows configured — leads can't self-book" when the setting is empty; document the per-rep window JSON. Not a bug — a setup-visibility gap.

### B2 (LOW) — `dealValue` not editable on a discover-sourced deal
**Evidence:** with B-Completed, package is now a dropdown that auto-fills price from the ladder on convert (`convertDealToClient`: `price: deal.dealValue ?? pkg?.price ?? 0`). But a rep still can't set a *custom* price on a discover deal without going through the New-lead form. For "Custom" package (price null) the deal value stays 0.
**Tasks:** add a "Deal value" input to the call-notes panel (or an edit-deal control) so Custom-package deals get a real price. Low priority — the ladder covers the common case.

### B3 (LOW) — Stripe is mock mode everywhere
**Evidence:** `STRIPE_MODE`/`STRIPE_SECRET_KEY` unset → `onAgreementSigned` auto-marks-paid on sign (`payment.ts:55`). Fine for demo; real charges need config.
**Covered by** the existing plan `docs/superpowers/plans/2026-07-16-agreement-payment-automation.md` (Phase A). No new work here — cross-reference only.

### B4 (LOW) — dev sender still the Workspace token
**Evidence:** admin@purewaterautomations.com is connected on **prod** only; dev-team funnel emails still send via the okamotomiak Workspace token. Optional: repeat the `/admin/email` connect on dev + set `GMAIL_SENDER_TOKEN_FILE` there.

---

## Completed (shipped 2026-07-16, `pwaos-fix/sales-polish-2026-07-16` @ a6e837e, verified live)

- **C1 — agreement modal z-order.** `AgreementPreviewModal` z-index 50→100 so the review-before-send modal renders above the deal Drawer (z91) it's always opened from. Was rendered *behind* the drawer for every user (not just deep-links). Verified: modal now centered on top, Confirm/Cancel reachable.
- **C2 — package dropdowns.** Call-notes "Recommended package" and New-lead "Package" are now `<select>`s of the package ladder (Hourly…Custom) instead of free text, so the price auto-fills on convert (a typo previously risked $0). Verified live: dropdown renders all 8 ladder options.

---

## Suggested sequencing

1. **Sales is essentially done** — C1/C2 shipped; B1 (booking-window visibility) is the only one worth doing soon; B2/B4 are nice-to-haves; B3 rides the payment-automation plan.
2. **Trial needs A1 + A2 before real candidates** (the two HIGH items) — everything else (A3/A4/A6) is quality; A5/A7 are decisions/config. Do A1 first (it unblocks A3's evidence-ready trigger).
3. Trial work waits on the `feature/skills-trial-v2` branch decision (merge target) — it's not on trunk yet.
