# Discovery Calls: Google Meet → Zoom Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Discovery-call bookings hand the lead a **Zoom join link** instead of a Google Meet link (team-sync feedback, Jul 16).

**Architecture — hybrid, deliberately:** Google Calendar stays for what Zoom cannot do — `repBusy()` free/busy checks (Zoom has no calendar API) and the rep's calendar event + reschedule/cancel plumbing. Zoom is added ONLY as the video-link provider: on booking, create a Zoom meeting via REST and use its `join_url` as `videoUrl`; the GCal event is created WITHOUT `conferenceData` and carries the Zoom link in `location`/`description`. The `.ics`, emails, reminder worker, and `/discovery/[token]` page all consume an opaque `videoUrl` string already — zero changes there.

**v1 scope decision (ponytail):** ONE shared Zoom account creates all discovery meetings — the existing `ZoomConnection` row (the Marketplace-app installer, i.e. the PWA account). No per-rep Zoom identity plumbing in v1; reps join via the link like everyone else. `// ponytail: single shared Zoom host; add repEmail-keyed connections if reps need host controls.`

**Tech stack:** existing `src/lib/zoom/oauth.ts` token machinery (`accessTokenForHost`), Zoom REST `POST/PATCH/DELETE /v2/users/me/meetings*`, existing `ZoomConnection` model — **no schema change** (`Deal.discoveryCalEventId`/`discoveryCalId` names are provider-agnostic; the Zoom meeting id gets its own new field, see Task 2).

**Prereq (human step, Justin):** add scope `meeting:write:meeting` to the Zoom Marketplace app + reinstall/reconsent the PWA Zoom account. Everything below no-ops gracefully until that's done (same best-effort pattern as the Google block).

---

### Task 1: Zoom meeting helper (`src/lib/zoom/meetings.ts`)

**Files:** Create `src/lib/zoom/meetings.ts` · Test `tests/zoom-meetings.test.ts`

- [ ] Test first: URL/body construction + response parsing are pure — factor `buildMeetingBody(input)` (topic, ISO start, duration, timezone, settings `{ join_before_host: true, waiting_room: false }`) and `parseMeeting(json)` → `{ id, joinUrl }`; assert body shape and that `parseMeeting` throws on missing `join_url`.
- [ ] Implement three thin fetch helpers mirroring `src/lib/google/calendar.ts`'s shape:
  - `createZoomMeeting(auth, input)` → `POST https://api.zoom.us/v2/users/me/meetings` → `{ id, joinUrl }`
  - `updateZoomMeetingTime(auth, meetingId, startIso, durationMin)` → `PATCH /v2/meetings/{id}`
  - `deleteZoomMeeting(auth, meetingId)` → `DELETE /v2/meetings/{id}` (204/404 both fine)
  `auth` = bearer token from the existing `accessTokenForHost()` (`src/lib/zoom/connection.ts:44-62`).
- [ ] `resolveDiscoveryZoom()`: return the first active `ZoomConnection` + fresh access token, or `null` (no connection / refresh failure) — the caller treats `null` as "no Zoom, fall back".

### Task 2: Wire into booking (3 call sites in `src/lib/actions/discovery-booking.ts`)

**Files:** Modify `src/lib/actions/discovery-booking.ts:241-276` (book), `:304-313` (cancel); `prisma/schema.prisma` (+1 field); Test `tests/discovery-booking.test.ts` (extend)

- [ ] Schema: add `discoveryZoomMeetingId String?` to `Deal` + headless migration (house pattern — `prisma migrate diff`, never `migrate dev`).
- [ ] In `bookDiscoveryCall()` inside the existing best-effort try/catch, BEFORE the calendar block: `const zoom = await resolveDiscoveryZoom(); if (zoom) { create or PATCH (reschedule) the Zoom meeting; videoUrl = joinUrl; }`. Then pass `meetRequestId: undefined` to `createEvent` when a Zoom link exists (suppresses Meet provisioning) and put the Zoom URL in the event `location`. Rep-change reschedule: delete old Zoom meeting, create new (mirrors the GCal delete/create at `:253-255`).
- [ ] In `cancelDiscoveryCall()`: best-effort `deleteZoomMeeting` alongside the existing `deleteEvent`.
- [ ] Fallback chain stays exactly: Zoom → Meet (if no ZoomConnection) → `rep.videoUrl`/`discovery_call_video_url` setting → no link. One-line log on each fallback so the active provider is diagnosable.

### Task 3: Verify

- [ ] `npm test`, `npm run build`.
- [ ] Local E2E with the PWA Zoom connection seeded: book a slot on `/discover` → confirm email + `/discovery/[token]` show a `zoom.us/j/…` link; reschedule → same meeting id, new time; cancel → meeting deleted in Zoom.
- [ ] Confirm a booking with NO ZoomConnection still produces a Meet link (regression guard).

**Estimate:** ~half day + the Marketplace scope step. **Risk:** low — additive, every Zoom failure degrades to today's behavior.
