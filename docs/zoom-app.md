# Zoom Meeting App — Phase 1 (post-meeting capture)

Captures **post-meeting Zoom recording transcripts** and feeds them into the existing
Meeting Actions pipeline (`/meeting-actions` → confirm → Task). No bot joins the call;
no VPS harvester involved. Phase 2 (live in-meeting panel + RTMS) is deferred.

## How it works

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

## Not built yet (follow-ups)

- A "Connect Zoom" button in the admin UI (today: hit `/api/zoom/oauth/start` directly).
- A provenance badge on `/meeting-actions` using `MeetingAction.source`.
- Phase 2: in-meeting panel + RTMS (`meeting.rtms_started`, live `ProposedItem`s).
