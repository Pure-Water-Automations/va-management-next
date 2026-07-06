# Zoom Meeting App — Phase 1 (post-meeting capture) + Phase 2 (live in-meeting capture)

**Phase 1** captures **post-meeting Zoom recording transcripts** and feeds them into the
existing Meeting Actions pipeline (`/meeting-actions` → confirm → Task). No bot joins the
call; no VPS harvester involved.

**Phase 2** adds **live capture**: a Zoom Apps panel + a Realtime Media Streams (RTMS)
worker propose tasks *during* the call, with speaker roles resolved before classification.
Same pipeline, same review queue — the panel and `/meeting-actions` are two views over one
list (`MeetingAction.source = "ZOOM_APP_LIVE"`, badged **Zoom Live**).

## How Phase 1 works

```
Zoom account (client's or VA's, app installed via OAuth)
  └─ recording.transcript_completed  ──▶  POST /api/zoom/webhook
                                            • verify x-zm-signature
                                            • fast idempotent insert: ZoomMeetingCapture (PENDING)
                                            • ack 200  (no download/LLM here)
        worker/zoom-capture-process.ts (systemd timer, every 5 min)
          • drain PENDING captures
          • download the TRANSCRIPT (VTT) → Meetings/*.md shape (src/lib/zoom/vtt.ts)
          • SAME extraction (src/lib/meetings/extract.ts, OpenRouter)
          • persistMeetingActions(source="ZOOM_APP_RECORDING")
                                            └─▶ MeetingAction(+Items) → /meeting-actions → Task
```

Two idempotency cursors: the webhook dedupes on `ZoomMeetingCapture.meetingUuid`; the
worker writes a `MeetingAction` keyed `meetingFile = zoom-app://<uuid>`.

> The Zoom-app path deliberately **skips** the harvester's `ALLOWED_ACCOUNTS` scope gate
> (`src/lib/meetings/extract.ts`): that gate is for the internal Northeast/BFC accounts,
> whereas app captures come from clients' own Zoom accounts.

## What you need to create in the Zoom Marketplace (the human step)

Create one app at https://marketplace.zoom.us → **Develop → Build App → General app**,
**User-Managed**. Then:

| Setting | Value |
| --- | --- |
| **OAuth Redirect URL** (+ add to OAuth allow list) | `https://team.purewaterautomations.com/api/zoom/oauth/callback` (prod) and `https://dev-team.pwasecondbrain.uk/api/zoom/oauth/callback` (dev) |
| **Event Subscription** endpoint URL | `https://team.purewaterautomations.com/api/zoom/webhook` |
| Subscribed **event** | `recording.transcript_completed` |
| **Secret Token** (from Event Subscription) | → `ZOOM_WEBHOOK_SECRET_TOKEN` |
| **Scopes** | `cloud_recording:read:list_recording_files` (download recording files) + `user:read` (identify the account at `/users/me`) |
| Client ID / Client Secret | → `ZOOM_CLIENT_ID` / `ZOOM_CLIENT_SECRET` |

**Cloudflare Access:** `/api/zoom/webhook` must be on the CF Access **bypass** (Zoom's
servers post to it), same as `/api/stripe/webhook`.

## Env vars

Set in the box's `shared/.env.production` (or `/etc/secondbrain/zoom.env` wired via a
systemd `EnvironmentFile=`). All optional — until they're set the OAuth route redirects
back with `?zoom=unconfigured` and the webhook returns **503**, so nothing activates.

```
ZOOM_CLIENT_ID=...
ZOOM_CLIENT_SECRET=...
ZOOM_WEBHOOK_SECRET_TOKEN=...
# Optional — defaults to ${APP_BASE_URL}/api/zoom/oauth/callback
# ZOOM_REDIRECT_URI=https://team.purewaterautomations.com/api/zoom/oauth/callback
```

## Deploy steps

1. **Migrate:** `npm run prisma:migrate` (applies `add_zoom_capture` → `ZoomConnection`,
   `ZoomMeetingCapture`, `MeetingAction.source`).
2. **Enable the worker timer:** install + enable `va-management-zoom-capture.timer`
   (mirrors `va-management-transcript.timer`). Run once manually to smoke it:
   `npm run worker:zoom-capture`.
3. **Connect an account:** an admin visits `/api/zoom/oauth/start` and authorizes. The
   callback stores a `ZoomConnection` (linked to the installing user).

## Definition of Done (pilot)

A pilot client installs the app → records a meeting **with cloud recording + audio
transcription enabled** → within ~5 min of `recording.transcript_completed`, action items
appear in `/meeting-actions` with speaker attribution. Confirming an item creates a Task
exactly as harvested items do. **No per-meeting Zoom cost** on this path (that's a Phase-2
RTMS concern).

## How Phase 2 works (live in-meeting capture)

```
Zoom meeting (app installed; RTMS started via auto-start or the panel button)
  ├─ meeting.rtms_started  ──▶  POST /api/zoom/webhook
  │                               • fast idempotent write: ZoomMeetingCapture
  │                                 (source=RTMS, status=PENDING, payload.rtms = join creds)
  ├─ meeting.rtms_stopped  ──▶  stamps payload.stoppedAt (end signal)
  │
  worker/rtms-live.ts  (systemd service va-management-rtms — long-running, NOT a timer)
    • polls PENDING RTMS rows → joins via @zoom/rtms (transcript media only) → status LIVE
    • per segment: Zoom display name → src/lib/zoom/identity.ts (email/name → console user
      → role) BEFORE classification — "[client] Dan: …" vs "[va] Aira: …"
    • rolling windows (src/lib/zoom/live-classify.ts): ≥300 chars + 25s debounce → LLM →
      strict JSON {kind, title, confidence, evidenceQuote, …} → drop <0.5 confidence +
      duplicate titles → append MeetingActionItem rows (MeetingAction source=ZOOM_APP_LIVE)
    • ends on: SDK close / webhook stop stamp / 30-min silence / 5-h cap → final sweep →
      status PROCESSED
  │
  In-meeting panel (Zoom Apps surface)  GET /api/zoom/panel
    • served from /api/* on purpose: page routes sit behind CF Access + NextAuth, which
      Zoom's embedded browser can't pass; /api/* already passes (like the webhooks)
    • auth = decrypted X-Zoom-App-Context header → meeting-scoped HMAC panel token
    • SSE /api/zoom/panel/items streams proposed items live (DB-poll-backed)
    • reviewer (mapped user with review+delegate caps): Confirm → the SAME
      confirmMeetingActionItem path (task + assignment email + audit) · Skip (+reason)
    • everyone else (guests/clients): 👍/👎 votes only — no task creation from a client
      surface; votes show on the item for the reviewer
```

Fallback guardrail: if the live session never delivers (worker down, join failed, stream
stopped before join), a later `recording.transcript_completed` for the same meeting
**takes the row over** (source flips back to RECORDING) so the meeting is still captured
post-hoc. A LIVE/PROCESSED session blocks the recording path — one meeting never extracts
twice.

### Phase 2 Marketplace additions (the human step)

On the same Marketplace app:

| Setting | Value |
| --- | --- |
| Extra **events** | `meeting.rtms_started` + `meeting.rtms_stopped` |
| Extra **scope** | `meeting:read:meeting_transcript` |
| **Zoom App surface** | enable it; Home URL = `https://dev-team.pwasecondbrain.uk/api/zoom/panel` (prod: `https://team.purewaterautomations.com/api/zoom/panel`) |
| **Zoom App SDK APIs** (allow list) | `getMeetingContext`, `getMeetingUUID`, `getMeetingParticipants`, `onParticipantChange`, `startRTMS`, `stopRTMS` |
| **RTMS** | enable Realtime Media Streams (needs Zoom Developer Pack credits — metered per meeting-hour) |

Gotchas:
- Until the app passes Marketplace review, `startRTMS()` from the panel can fail with
  **40316** — enable **RTMS auto-start** in the app settings for dev testing (the webhook
  path then fires without the button).
- The host must be present in the meeting for RTMS to start.
- RTMS is **metered** (Developer Pack credits). Get a real credit-burn number from one
  pilot meeting before promising clients live capture. Phase 1 recording capture stays
  free — it's the default; live is opt-in per meeting.

### Phase 2 deploy steps (dev box)

1. `./deploy.sh dev <ref>` (npm ci installs the optional `@zoom/rtms` linux-x64 binary;
   `prisma migrate deploy` applies `zoom_rtms_live`).
2. Install + start the worker service (one-time):
   `cp deploy/systemd/va-management-rtms.service /etc/systemd/system/ && systemctl daemon-reload && systemctl enable --now va-management-rtms`
   (later deploys auto-restart it via `systemctl try-restart` in deploy.sh).
3. Smoke: `npx tsx worker/rtms-live.ts --smoke` (checks config + SDK, sweeps, exits) and
   `journalctl -u va-management-rtms -n 20`.
4. Verify the panel is publicly reachable (Zoom's webview must pass CF Access):
   `curl -s https://dev-team.pwasecondbrain.uk/api/zoom/panel | head -3` → should be our
   "Open this inside Zoom" HTML, **not** a Cloudflare Access login page.

Worker tunables (env, all optional): `RTMS_POLL_MS` (3000), `RTMS_MIN_CONFIDENCE` (0.5),
`RTMS_IDLE_END_MS` (30 min), `RTMS_MAX_SESSION_MS` (5 h), `RTMS_STALE_PENDING_MS` (2 h),
`RTMS_MAX_JOIN_ATTEMPTS` (3).

## Definition of Done (Phase 2 pilot)

Open a meeting on a connected account → open the app panel → Start live capture (or
auto-start) → talk through a real commitment ("I'll send you the contract tomorrow") →
within ~30 s the item appears in the panel with the speaker's role attached → a reviewer
confirms it in-call → the Task exists with the assignment email sent, and the item shows
**Zoom Live** provenance in `/meeting-actions`. Unidentified speakers show as
"unknown" and never auto-assign an owner.

## Not built yet (follow-ups)

- `kind: "project"` items still confirm into Tasks (badged *project* as a hint); routing
  them through `create_project` needs a project-shaped confirm form.
- Marketplace review submission (required before external users can use the panel/RTMS in
  prod) and the client-scoped review surface (`clientOrganizationId`) for client-facing
  installs.
- Optional: mirror live-confirmed items to Notion like other components.
