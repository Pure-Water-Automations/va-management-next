# Funnel Email Rebrand + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Outbound funnel emails send from `admin@purewaterautomations.com` instead of Justin's personal address, plus a copy-polish pass (Jul 16 sync).

**Audit finding that shapes this plan:** the sender is TWO layers — the cosmetic `From:` header (`system_email_from` Setting) and the OAuth token that actually authorizes the Gmail send. Today `GMAIL_SENDER_TOKEN_FILE` is unset everywhere, so every send falls back to the okamotomiak Workspace token and Gmail rewrites the From header. The dedicated connect flow (`/admin/email` → `/api/email-auth/*`) already exists and even names `admin@purewaterautomations.com` in its instructions — it's just never been completed, and even completing it wouldn't take effect without the env var (the resolution bug below). Also: NO email in the system emits a `Reply-To` header (the `system_email_reply_to` Setting exists but is wired to nothing), and 4 send sites silently skip sending when `system_email_from` is unset instead of using the standard fallback.

**All 12+ funnel emails route through the single `sendSystemEmail()` (`src/lib/email.ts`)** — so the sender fix is global-by-construction; the polish pass is per-call-site copy.

---

### Task 1: Sender switch (mostly ops, one env line)

- [ ] **Human step (Justin or admin):** on prod, visit `/admin/email` → "Connect a sending Gmail" → authenticate as `admin@purewaterautomations.com` (needs `GOOGLE_OAUTH_CLIENT_ID/SECRET` present — they are, the calendar flow uses the same client; add admin@ as a test user on the OAuth consent screen if unpublished). Callback auto-writes the token file and sets `system_email_from = admin@purewaterautomations.com`.
- [ ] Add `GMAIL_SENDER_TOKEN_FILE=<path the callback wrote, default .secrets/email-sender-token.json>` to the box env + restart — **without this the send path keeps using the Workspace token and Gmail keeps rewriting the From** (`email.ts:62` resolution order). Do dev first, then prod.
- [ ] RFC-2047 check: subjects with em-dashes are already encoded per the gmail-send recipe — verify one send post-switch for mojibake anyway.

### Task 2: From-resolution consistency (small code)

**Files:** `src/lib/actions/discovery.ts:112`, `src/lib/actions/discovery-booking.ts:331,359`, `worker/discovery-reminders.ts:13`

- [ ] These 4 sites read `system_email_from` raw and **silently skip sending** when unset. Switch them to the standard `systemEmailFrom(settings)` helper (`src/lib/sales/util.ts:7-14`) so they fall back like every other sender instead of dropping mail on the floor. (Root-cause fix: one helper, all callers.)

### Task 3: Reply-To support (small code)

**Files:** `src/lib/email.ts` (`buildMimeMessage` + `sendSystemEmail` opts)

- [ ] Emit a `Reply-To:` header when provided; plumb `system_email_reply_to` Setting through `sendSystemEmail` as the default. Lets replies go to Justin/sales while From stays admin@. Add to the admin email page as an editable field (currently the Setting exists with no UI writer).

### Task 4: Copy polish pass (content, no logic)

- [ ] Sweep the inventoried templates — lead confirmation + rep notice + cancellation + reminder (`discovery-booking.ts`, `discovery-reminders.ts`), agreement send + signed delivery (`agreement.ts`), new-lead + new-client internal notices (`discovery.ts`, `deal.ts`), follow-up nudges (`worker/sales-followup.ts`), onboarding welcome/intake (`client-onboarding.ts`). Consistent: PWA name + `purewaterautomations.com` links (official-domain rule), warm sign-off matching the seeded email templates' voice ("With you in the mission"), lead-facing emails say who we are in the first line.
- [ ] Keep it text-plain (current format) — no HTML templating project smuggled in.

### Task 5: Verify

- [ ] Dev: trigger a booking → confirm From shows admin@ (not rewritten), Reply-To present, `.ics` still attaches; unset `system_email_from` locally → Task 2 sites still send via fallback.
- [ ] `npm test` (email tests exist for MIME building — extend for Reply-To).

**Estimate:** Task 1 = 15 min human + env; Tasks 2-3 ~1 hr; Task 4 ~2 hrs. **Risk:** low; the one sharp edge is doing Task 1's env var on prod (missing it = silent no-change).
