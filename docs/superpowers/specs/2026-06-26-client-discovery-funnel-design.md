# Client discovery funnel integration — design spec

**Date:** 2026-06-26
**Status:** Approved (design), pending implementation plan
**Author:** Justin + Claude

## Summary

Build the public "website → system" front door for **clients**, mirroring what
`/apply` already does for **recruitment candidates**. Today the client side has a
fully-built *downstream* (Deal pipeline → e-sign agreement → Stripe payment →
`convertDealToClient` → ClientOrganization + onboarding checklist + portal), but
**no self-serve entry point**: leads are captured manually or via a Notion form,
and discovery calls are booked by a rep hand-sending a TidyCal link.

This project adds the missing front of the funnel and wires it into the existing
pipeline:

1. A public `/discover` lead-capture form (no-auth) that auto-creates a `Deal`.
2. Async AI lead scoring (hot/warm/cold), mirroring candidate AI screening.
3. A **native, multi-rep** discovery-call booking flow (replaces TidyCal),
   backed by sales reps' Google Calendars.
4. Structured discovery-call notes capture and pipeline tightening.
5. A dedicated **Sales** role + `/sales` console (mirroring the recruitment/HR
   gated sections) where reps see and work the pipeline.
6. Drift cleanup so the SOPs and the app agree on canonical tools (native
   `/sign` and `/intake`, retiring BunnyDoc/DocuSign/Formly references).

The endpoint of recruitment's funnel (`createVaFromCandidate`) is replaced here
by the already-built `convertDealToClient` chain — so the bottom half of the
journey is **reuse, not rebuild**.

## Goals

- A pastor/ministry lead can go from the marketing site to a booked discovery
  call without a human in the loop, landing as a scored `Deal` in the pipeline.
- Sales reps get a purpose-built view of their pipeline and bookings.
- Booking supports multiple reps now (union of open slots; picking a slot
  assigns that rep as account owner) with no rework as the team grows.
- The app becomes the single operational source of truth for client
  acquisition, ending the Notion/Formly/TidyCal/BunnyDoc drift.

## Non-goals (YAGNI)

- No new top-level lead/booking tables — everything hangs off `Deal`.
- No full Calendly clone: booking is rep-defined availability windows minus
  Google Calendar conflicts, not arbitrary recurring-rule scheduling.
- No rebuild of agreement / payment / onboarding / portal — those exist.
- No marketing-site rebuild; we expose `/discover` and link/embed it.
- No automated AI proposal generation (rep still writes the proposal).

## The pattern we mirror (recruitment → client)

| Recruitment (exists) | Client (this project) |
|---|---|
| `/apply` public form | `/discover` public form |
| `api/apply/route.ts` | `api/discover/route.ts` |
| `lib/application-questions.ts` | `lib/discovery-questions.ts` |
| `actions/apply.ts` (`submitApplication`) | `actions/discovery.ts` (`submitDiscoveryLead`) |
| `actions/screening.ts` (`screenAndSaveCandidate`) | `actions/lead-screening.ts` (`scoreAndSaveLead`) |
| `Candidate` rows on `/recruitment` board | `Deal` rows on `/sales` board |
| external `interview_booking_url` email | **native** multi-rep booking |
| `track/[token]` magic link | `discovery/[token]` magic link (reschedule/cancel) |
| `createVaFromCandidate` (endpoint) | `convertDealToClient` (endpoint, already built) |

## Data model

One migration. No new top-level tables for intake/scoring/notes — extend `Deal`.
A small `SalesRepAvailability` concept is added for multi-rep booking.

### `Deal` (extend)

- `source` — already exists; set `"native_form"` for public submissions.
- Intake: `discoveryJson Json?` (raw form answers).
- AI scoring (mirror `Candidate.screen*`):
  - `leadVerdict String?` — `hot | warm | cold`
  - `leadScore Int?` — 0–100
  - `leadSummary String?`
  - `leadFlags Json?` — `string[]`
  - `scoredAt DateTime?`
- Native booking:
  - `discoveryCallAt DateTime?`
  - `discoveryCallToken String? @unique` — magic link for reschedule/cancel
  - `discoveryCallStatus String?` — `scheduled | completed | no_show | cancelled`
  - `discoveryCallVideoUrl String?`
  - `discoveryRepEmail String?` — rep whose slot was chosen (also set as
    `accountOwnerEmail`)
- Call notes: `discoveryNotesJson Json?` — current situation, pain points,
  desired finish line, cost of inaction, recommended package, buying signals,
  objections, decision process, next step, follow-up date.

### Sales rep availability (new, minimal)

To support multiple reps' calendars, store per-rep booking config. Two viable
shapes — the implementation plan picks one:

- **Option A (Setting-backed, simplest):** a `discovery_booking_windows` JSON in
  the existing `Setting` table keyed by rep email, e.g.
  `{ "rep@pwa.com": { windows: [...], calendarId: "...", videoUrl: "..." } }`.
- **Option B (table):** `SalesRepAvailability { repEmail, weeklyWindows Json,
  googleCalendarId, defaultVideoUrl, active }`.

Recommendation: start with **Option A** (no schema churn, easy to edit in
settings UI); migrate to a table only if rep count / per-rep UI demands it.

## Native discovery booking (the one new subsystem)

This is the only piece with no recruitment precedent (recruitment emails an
external link). Design:

1. **Availability source:** each active sales rep has booking windows (e.g.
   "Tue/Thu 9–12 ET") + a Google Calendar id, from the availability config above.
2. **Open-slot computation:** generate candidate slots from each rep's windows
   over the next N days, then remove any that conflict with that rep's Google
   Calendar busy times (via the existing google-workspace MCP / Calendar infra
   already used elsewhere in the app). The lead sees the **union** of open slots
   across all active reps.
3. **On booking:** pick the slot → assign `discoveryRepEmail` =
   `accountOwnerEmail` = the rep who owns that slot → create a Google Calendar
   event on that rep's calendar with the lead invited + a video link →
   `Deal.stage = discovery_scheduled` → email confirmation to lead + rep → store
   `discoveryCallToken` for self-serve reschedule/cancel at `/discovery/[token]`.
4. **Reminders:** send a reminder `discovery_reminder_hours` before the call.
5. **No-show / cancel:** reflected via `discoveryCallStatus`; reschedule reissues
   a slot and moves the event.

Scope guard: windows + calendar-conflict removal only. No recurring-rule engine,
no timezone-preference negotiation beyond storing the lead's timezone.

## Sales role + view

- Add `SALES` to the `Role` enum (alongside `RECRUITER`).
- Promote the sales pipeline into its own top-level gated section
  `src/app/(app)/sales/` — mirroring `src/app/(app)/recruitment/`. Gated to
  `SALES` (plus admin / `HR_MANAGER`). The existing `/hr/sales` `SalesBoard`
  moves/renders here; `/hr/sales` can redirect for continuity.
- The sales view shows: the pipeline (kanban by `Deal.stage`), lead-score
  chips (verdict + score + AI summary), discovery-call time + status, and the
  rep's own bookings. Reuses the existing `SalesBoard` component, upgraded.

## New files (mirror recruitment structure)

- `src/app/discover/page.tsx` + `DiscoverClient` — public form (← `app/apply`).
- `src/app/api/discover/route.ts` — submit endpoint (← `api/apply`).
- `src/lib/discovery-questions.ts` — field config + validation
  (← `lib/application-questions.ts`).
- `src/lib/actions/discovery.ts` — `submitDiscoveryLead`, `bookDiscoveryCall`,
  `saveDiscoveryNotes` (← `actions/apply.ts` + parts of `actions/recruitment.ts`).
- `src/lib/actions/lead-screening.ts` — `scoreAndSaveLead`
  (← `actions/screening.ts`).
- `src/app/discovery/[token]/page.tsx` — reschedule/cancel (← `app/track/[token]`).
- `src/app/(app)/sales/page.tsx` — gated sales console (← `app/(app)/recruitment`).
- Upgrades to `SalesBoard` (score chip, call time, AI summary) and deal detail
  (notes capture form).

## Settings (DB-configurable, mirroring recruitment)

- `discovery_fields` — public form field config (← `skill_list` pattern).
- `sales_owner_email` — fallback recipient for new-lead notifications.
- `discovery_booking_windows` — per-rep availability + calendar id + video url.
- `discovery_call_video_url` — default video link.
- `discovery_reminder_hours` — reminder lead time.
- Reuse: `app_base_url`, `system_email_from`, `company_name`.

## Reuse / drift cleanup (downstream — no rebuild)

- E-sign: native `/sign/{token}` is canonical; retire BunnyDoc/DocuSign/HelloSign
  references in SOPs.
- Intake: native `/intake/{token}` is canonical; retire Formly.
- Confirm clean handoff from the funnel into the existing
  `sendClientAgreement → sign → markAgreementPaid → convertDealToClient` chain.
- Update the sales/onboarding SOPs to point staff at the app, not Notion.

## Data flow (end to end)

```
purewaterautomations.com
  → /discover (public form)
  → POST /api/discover → submitDiscoveryLead() → Deal(stage=new, source=native_form)
  → async scoreAndSaveLead() → leadVerdict/leadScore/leadSummary
  → notify sales owner; lead appears on /sales board with score chip
  → lead picks open slot (union across reps) → bookDiscoveryCall()
     → assign rep as accountOwner, create Google Calendar event,
       Deal.stage=discovery_scheduled, confirm + reminder emails
  → rep runs call → saveDiscoveryNotes() → Deal.stage=discovery_completed/proposal_needed
  → [EXISTING] sendClientAgreement → /sign/{token} → Stripe → markAgreementPaid
  → [EXISTING] convertDealToClient → ClientOrganization + ClientOnboarding
  → [EXISTING] /intake/{token} → onboarding checklist → kickoff → client portal
```

## Error handling & edge cases

- AI scoring is **best-effort async** (like candidate screening): a scoring
  failure never blocks lead capture; the Deal is created first, scored after.
- Booking races: if two leads grab the same slot, the second booking re-checks
  calendar conflicts at write time and is rejected with a "slot just taken,
  pick another" message.
- Expired/!invalid `discoveryCallToken`: `/discovery/[token]` shows an expired
  message with a path to rebook.
- Spam/duplicate leads: dedupe on `contactEmail`; flag obvious spam via
  `leadFlags` (mirror screening) rather than dropping silently.
- No active reps / no open slots: form still captures the lead (stage=new) and
  surfaces "we'll reach out to schedule" instead of a slot picker.

## Build phases (each independently shippable)

1. **Public lead capture + AI scoring** — `/discover`, `/api/discover`, `Deal`
   extension, `scoreAndSaveLead`, Sales Board score chips, new-lead
   notification. *(Core website→system win; ships standalone — booking can stay
   a TidyCal link in this phase.)*
2. **Native multi-rep discovery booking** — availability config, open-slot
   computation + calendar conflict removal, `bookDiscoveryCall`, Calendar event,
   confirmation + reminder emails, `/discovery/[token]` reschedule/cancel.
3. **Discovery-call notes + pipeline tightening** — structured notes capture,
   stage transitions, handoff summary.
4. **Sales role + view, drift cleanup, marketing-site link** — `SALES` role +
   `/sales` console, standardize sign/intake as canonical, embed/link
   `/discover` on purewaterautomations.com, update SOPs.

> Sequencing note: the `SALES` role + `/sales` section (phase 4) can be pulled
> earlier if reps need the dedicated view before booking ships — it only depends
> on the existing `SalesBoard`. Order is a planning decision.

## Testing strategy

- Unit: `discovery-questions` validation; open-slot computation (windows minus
  busy times, multi-rep union, race rejection); `leadVerdict` mapping.
- Integration: `POST /api/discover` creates a Deal + triggers async scoring;
  `bookDiscoveryCall` assigns rep + creates event + advances stage; token
  reschedule moves the event.
- E2E (happy path): submit `/discover` → score appears on `/sales` → book a slot
  → confirmation email → notes capture → handoff into existing agreement flow.
- Role gating: `/sales` and discovery actions enforce `SALES`/admin.

## Open questions for the plan

- Availability config shape: Setting JSON (Option A) vs table (Option B).
- Whether to pull the `SALES` role + `/sales` view forward ahead of booking.
- Reminder delivery mechanism (existing cron/job vs send-on-load check).
