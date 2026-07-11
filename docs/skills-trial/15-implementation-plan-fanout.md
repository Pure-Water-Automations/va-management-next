# PWA Skills Trial — Multi-Agent Fan-out Implementation Plan

**Status:** Awaiting Justin's approval to dispatch.
**Executes:** the full PRD in `docs/skills-trial/` (00–14 + appendices A–F).
**Mechanism:** [[agent-router]] `fanout.js` — parallel git worktrees across Codex (ChatGPT credits), Antigravity (Google credits), and pooled Claude accounts. Review-only: every leg returns a diff; nothing merges without approval.

---

## 1. Why this shape

The build has one hard dependency spine: **Prisma schema + shared contracts → everything else**. Once the schema, enums, API payload types, and event taxonomy exist on a base branch, the remaining five workstreams touch **disjoint file trees** and can run fully in parallel:

| Workstream | Files (exclusive ownership) |
|---|---|
| Candidate trial engine + API | `src/app/api/trials/*` (candidate routes), `src/lib/trial/engine.ts` |
| AI orchestration layer | `src/lib/trial/ai/**` |
| Candidate Mission Control UI | `src/app/track/[token]/mission-control/**` |
| Reviewer console | `src/app/(app)/recruitment/gate/**`, `src/app/api/trials/review/**` |
| Background workers + notifications | `scripts/trial-*.ts`, `src/lib/trial/schedule.ts` |

The one deliberate cross-leg touchpoint: the Candidate UI leg makes a **minimal version-branch edit** to `TrackClient.tsx` (per doc 14 §2.3 — `versionId === 2` → render Mission Control, else legacy checklist). Every other leg is told explicitly NOT to touch that file. The adversarial review pass (Antigravity, runs automatically after all legs finish) hunts exactly this class of cross-worktree integration conflict.

---

## 2. Wave 0 — Foundation (sequential, done INLINE before dispatch)

Done by Claude in this session (single sequential task with full context = inline beats offload), committed to a new branch **`feature/skills-trial-v2`** which becomes the fanout `baseBranch`.

1. **Prisma schema** (doc 09 §3 / Appendix D, verbatim): `TrialProgramVersion`, `MissionTemplate`, `CandidateTrial`, `CandidateMission`, `TrialEvent`, `TrialConversation`, `TrialMessage`; enums `TrialStatus`, `MissionStatus`; `Candidate.trial` relation.
2. **Migration** headlessly via `prisma migrate diff --script` → `migrate deploy` + `generate` (never `migrate dev` — it hangs agents).
3. **Shared contracts** — the interface every leg codes against:
   - `src/lib/trial/types.ts` — request/response payloads from Appendix C (acknowledge, step/start, step/submit, message/reply, escalate, review) + feedback JSON shape `{obs, impact, sugg, enc}`.
   - `src/lib/trial/events.ts` — the 13 `TrialEvent` label constants from doc 12 §1.
   - `SKILLS_TRIAL_V2` feature flag in `src/lib/env.ts` (default off; Stage-1 gate per doc 14).
4. **Seed script** `scripts/seed-skills-trial.ts` — `TrialProgramVersion` 1 (legacy mapping) + Version 2 with the 9 `MissionTemplate` rows from Appendix E (stories, scenario checks, briefs, est. minutes, day-due).
5. Commit. This frozen contract is what makes the five legs safely independent.

---

## 3. Wave 1 — Parallel fan-out (5 legs, one `fanout.js` run)

Backends follow the skill heuristic: Codex for multi-file backend work (parallelizes freely), Claude pool for the two UI legs (design judgment; accountA→accountB), Antigravity for exactly one serial stream (workers) and then the adversarial review. Models/effort left to the router's auto-selection.

### Leg 1 — Trial engine + candidate API · `codex` · `fanout/trial-api`
- Route handlers per Appendix C: `POST /api/trials/acknowledge`, `step/start`, `step/submit`, `message/reply`, `escalate`, `GET /api/trials/steps` — magic-link bearer auth reusing the existing `trainingAccessToken` strategy (doc 09 §2), stage-gated to `tenhr_in_progress`.
- `src/lib/trial/engine.ts`: trial initialization (snapshot `CandidateMission` rows from the active `TrialProgramVersion` — content-leakage guard), mission state machine per Appendix B (`NOT_STARTED → IN_PROGRESS → SUBMITTED → APPROVED | NEEDS_REVISION → …`), **server-side timer delta math** (stateless start/stop, backend-calculated durations, 6-hour `STEP_TIMED_OUT` auto-pause) — acceptance criterion: no client-side clock spoofing.
- Every action logs a `TrialEvent` using the Wave-0 constants.
- Tests: `tests/trial-engine.test.ts`, `tests/trial-availability.test.ts` (declared-window latency math).
- **Must not touch:** `TrackClient.tsx`, `src/lib/trial/ai/`, gate pages, `api/trials/review`.

### Leg 2 — AI orchestration layer · `codex` · `fanout/trial-ai`
- `src/lib/trial/ai/**` only: the five personas from doc 10 — Purii (coordinator; escalation triggers on health/hostility/accommodation), Sarah (feedback engine; structured JSON output `{approved, feedback:{obs,impact,sugg,enc}}` with the Community-Impact-Day criteria), Emily (mentor; hints never answers), Michael (simulated client; answers direct questions, plays confused at vague ones), Reviewer Assistant (neutral, no emotional adjectives).
- **Reuse the existing OpenRouter client** (`src/lib/matrix/openrouter.ts`) — do not add a new HTTP layer. Model env-driven: `TRIAL_AI_MODEL` default `google/gemini-2.5-flash-lite` (DEC-006), overridable to an NVIDIA NIM base URL for dev.
- Guardrails as code: persona-prefix disclosure tags, prohibited-action filters (never pass/fail statements, never rate negotiation), rate limiting, and the doc 03 §3 escalation rules routing to human review.
- Tests: `tests/trial-fairness.test.ts` (accommodation/escalation events excluded from scoring suggestions).
- **Must not touch:** route handlers, UI, `engine.ts`.

### Leg 3 — Candidate Mission Control UI · `claude` · `fanout/trial-candidate-ui`
- `src/app/track/[token]/mission-control/**`: the 14 candidate screens from doc 08 §2 — Welcome/AI-disclosure + availability onboarding, Mission Control home (Focus Card, HUD with day chip / 10h accumulator / timer / "Ask a person"), missions grid, mission detail with timer, messages + check-in form (4 questions), calendar week, resources, submission inputs per step kind, revision feedback card (obs/impact/sugg/enc + required revision plan), progress/trust dashboard, reflection, completion state, blocker/escalation modals.
- Style per doc 05/08 + Appendix F: navy `#0d1d5f`, 18px cards, Inter/Outfit, anti-gamification (trust ladder, no XP/streaks).
- **Sole permitted edit outside its tree:** the version branch in `TrackClient.tsx`/`page.tsx` (`versionId === 2` → Mission Control, else legacy — doc 14 §2.3). Keep it to a stub import.
- Codes against Wave-0 `types.ts`; API calls to Leg-1 endpoints (contract-typed, wiring verified in Wave 2).

### Leg 4 — Reviewer console · `claude` · `fanout/trial-reviewer-ui`
- Extend `src/app/(app)/recruitment/gate/**` per doc 08 §3 + doc 13: candidate queue sidebar, evidence summary with flags, chronological timeline replay (actor badges), competency evidence explorer, artifact comparison (initial vs revised side-by-side), 7-dimension weighted rubric panel (20/20/20/15/10/10/5, AI-suggested badge + human 1-5 buttons), final decision panel.
- `POST /api/trials/review` (NextAuth-gated): decision → stage transitions (pass→`tenhr_pass`, revision, waitlist→`decision`, close→`closed`) per doc 13 §3.
- **Hard validation** (acceptance criterion): Pass blocked unless all 7 dimensions scored, rationale non-empty, critical flags resolved; enforce 75+ total and ≥3 on the four core dims per doc 12 §3.
- Accommodation toggle ("Mark Active Accommodations") pausing reminders + excluding latency events.
- Tests: `tests/trial-gate.test.ts`.
- **Must not touch:** candidate `api/trials/*` routes (owns only `review/`), track pages.

### Leg 5 — Background workers + notifications · `antigravity` · `fanout/trial-workers`
- `scripts/trial-worker.ts` (+ `src/lib/trial/schedule.ts`): check-in window scheduler honoring declared timezone/days/block (doc 02 §4 — flags computed ONLY inside declared windows), reminder engine with `CHECKIN_REMINDED` counting, accommodation-pause awareness, 6h timer-timeout sweep, evidence-ready notifier to reviewers, invite/daily-brief email templates via existing `src/lib/email.ts` (RFC-2047 subjects) — **all sends console-logged, not sent, unless `SKILLS_TRIAL_V2` and prod env** (Stage-1 rule, doc 14).
- Systemd timer unit files + a `DEPLOY.md` note matching the app's existing worker pattern.
- Antigravity serializes anyway, so this single self-contained leg fits it; it also keeps Codex/Claude pools free.

### Fanout spec (ready to run)

Save as `/tmp/fanout_skills_trial.json` at dispatch time; leave `model`/`reasoning_effort` to the router.

```json
{
  "baseRepo": "/Users/justinokamoto/code/apps/va-management-next",
  "baseBranch": "feature/skills-trial-v2",
  "adversarialReview": true,
  "review": { "enabled": true, "backend": "antigravity", "fallbackBackend": "codex",
              "focus": "cross-leg integration: shared types drift, TrackClient branching, api/trials route ownership, feature-flag gating" },
  "tasks": [
    { "backend": "codex",       "branch": "fanout/trial-api",          "task": "<Leg 1 brief — see docs/skills-trial/15-implementation-plan-fanout.md §3, plus: read docs/skills-trial/09,12,13,B,C and src/lib/trial/types.ts first; do not edit files outside your ownership list>" },
    { "backend": "codex",       "branch": "fanout/trial-ai",           "task": "<Leg 2 brief — read docs/skills-trial/03,10 and reuse src/lib/matrix/openrouter.ts>" },
    { "backend": "claude",      "branch": "fanout/trial-candidate-ui", "task": "<Leg 3 brief — read docs/skills-trial/05,08,F,E; only cross-tree edit allowed: version branch in track/[token]>" },
    { "backend": "claude",      "branch": "fanout/trial-reviewer-ui",  "task": "<Leg 4 brief — read docs/skills-trial/08§3,12,13,C§2>" },
    { "backend": "antigravity", "branch": "fanout/trial-workers",      "task": "<Leg 5 brief — read docs/skills-trial/02§4,12§1,14; block real email sends>" }
  ]
}
```

Run: `node /Users/justinokamoto/SecondBrain/tools/agent-router/fanout.js /tmp/fanout_skills_trial.json` → report at `~/ar-fanout/<runId>/REPORT.md`. Each leg's full task text is expanded from §3 at dispatch time (self-contained: doc pointers + file ownership + must-not-touch list + "write your own tests, run `npm run build` + the test file before finishing").

---

## 4. Wave 2 — Integration & verification (inline, after Justin reviews diffs)

1. Review `REPORT.md` + adversarial findings with Justin; re-dispatch any `limit_reached`/failed leg on another backend **only on his say-so**.
2. Merge into `feature/skills-trial-v2` in dependency order: **Leg 1 → Leg 2 → Leg 4 → Leg 5 → Leg 3** (engine first, the `TrackClient.tsx`-touching UI leg last).
3. Wire-up pass: candidate UI ↔ API endpoints, Sarah feedback into `step/submit`, worker events into timelines. Fix drift the adversarial review flagged.
4. Data migration script (doc 14 §2): existing `tenhr_*` candidates → Version 1; new invites → Version 2.
5. Run migration + seed on the **IONOS dev box only** (never Hostinger prod; check what branch is on the shared dev box first per standing rule), flag ON in dev, emails blocked.
6. Verify the doc 14 acceptance checklist end-to-end with a synthetic candidate: immutable snapshot on gate approval, server-calculated timer, Pass-blocked-unscored, escalation alarm, timezone-window reminders. Real page loads, not just `/api/health`.
7. Stage 2+ (shadow pilot, live pilot, cutover) proceed per doc 14 on Justin's call.

---

## 5. Estimates & guardrails

- **Scale:** ~6 workstreams; Wave 1 wall-clock ≈ the slowest leg (likely candidate UI or the API engine), not the sum. Credit spend spreads across ChatGPT (2 legs), Claude pools (2 legs), Google (1 leg + review).
- **Independence audit:** file-tree ownership is disjoint by construction; the single shared file (`TrackClient.tsx`) is assigned to exactly one leg. Wave-0 contracts prevent type drift.
- **Failure handling:** a dead leg = re-dispatch that one task (report includes the recommendation); partial results are still mergeable since legs are independent.
- **Hard rules:** review-only (no auto-merge/commit/push), IONOS dev only, `SKILLS_TRIAL_V2` flag off by default, external emails logged not sent until Stage 3, humans make every gate decision (DEC-004).

## 6. Open items for Justin before dispatch

1. **Confirm the "Proposed default" decisions** in `00-decision-log.md` (DEC-006 model, DEC-007 hidden rubric, DEC-008 booking-link standups) — the legs will implement them as written.
2. **Wave 0 by me inline now, or as its own single Codex job?** Plan assumes inline (sequential, context-heavy → inline per the offload heuristic).
3. Green light to dispatch Wave 1 (5 legs, 3 credit pools).
