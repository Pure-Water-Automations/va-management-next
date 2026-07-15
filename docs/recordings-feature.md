# Recordings (in-app Loom-style screen recorder)

Browser-based screen + mic (+ webcam bubble) recording, stored in Cloudflare R2,
with an in-app player, AI transcript/summary, review workflow, and timestamped
comments. Built into the VA Management console.

**Status: open to staff, public share links live.** Any staff user with a linked VA
record (or HR/People-Ops/Recruiter review authority, or all-access) can record and
see their own + their reports' recordings via `isRecordingsVisible()`; per-recording
visibility (own / supervisor chain / client org / public link) is enforced by
`canSeeRecording()`. Clients only ever see videos explicitly shared to their org.
The candidate (recruitment) flow is still deferred — the schema already carries its
fields so enabling it later needs no migration.

---

## Implemented ✓

| Area | What | Where |
| --- | --- | --- |
| Schema | `Recording`, `RecordingComment`, enums `RecordingStatus`/`RecordingVisibility`; relations on `Va`/`Candidate`; `Candidate.tenhrRecordingId` | `prisma/schema.prisma` |
| Storage | Cloudflare R2 client, presigned upload/download, delete, server get/put, key helpers | `src/lib/r2.ts` |
| Env | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_BASE_URL`, `OPENAI_TRANSCRIBE_MODEL` | `src/lib/env.ts` |
| Logic | `createRecording`, `finalizeRecording`, `updateRecording` (mints a `shareToken` the first time visibility → `link`), `deleteRecording`, `addComment`, `reviewRecording`, `canSeeRecording` | `src/lib/actions/recordings.ts` |
| Reads | `listVisibleRecordings`, `getRecordingDetail` (+ `shareUrl`, presigned thumbnail/download), `getPublicRecordingByToken` | `src/lib/reads/recordings.ts` |
| API (POST, staff-only via `allow:(role)=>role!=="CLIENT_*"`) | `create`, `finalize`, `update`, `delete`, `review`, `enhance` | `src/app/api/recordings/**/route.ts` |
| API (POST, any role) | `comment` — `addComment()` does the per-recording check, so staff and clients-shared-a-video both pass the door | `src/app/api/recordings/comment/route.ts` |
| API (GET) | `stream/[id]` — auth-checked 302 to a presigned R2 URL (Range-friendly); `?download=1` for attachment | `src/app/api/recordings/stream/[id]/route.ts` |
| API (public, no auth) | `public/get` (POST, token in body) + `public/stream/[token]` (GET, 302 to R2) — same shape as the authenticated pair, keyed by `shareToken` instead of a session | `src/app/api/recordings/public/**/route.ts` |
| Recorder | screen+mic+webcam-bubble canvas compositor, MediaRecorder, pause/resume, length cap, thumbnail, presigned PUT upload w/ progress | `src/components/recorder/useScreenRecorder.ts`, `Recorder.tsx` |
| Player | video via stream proxy, AI summary, transcript w/ click-to-seek, comments + reactions, review controls, edit/delete, copyable share link | `src/components/recorder/RecordingDetailClient.tsx` |
| Public viewer | read-only title/video/summary/transcript for a `link`-visibility recording — no login, no comments | `src/app/watch/[token]/page.tsx`, `WatchClient.tsx` |
| Pages | `/record`, `/recordings` (library), `/recordings/[id]` (player) — each `notFound()` via `isRecordingsVisible()` | `src/app/(app)/record`, `src/app/(app)/recordings` |
| Nav | "Recordings" group in every console (Sidebar + VaTopNav), gated by `showRecordings` | `src/components/Sidebar.tsx`, `src/components/VaTopNav.tsx` (+ `src/app/(app)/layout.tsx`) |
| AI | ffmpeg audio extraction → OpenRouter multimodal transcript + title/summary in one cheap call (best-effort, non-blocking) | `worker/recordings-process.ts` (`npm run worker:recordings`), `worker/lib/media.ts`, `src/lib/recordings/transcription.ts` |

### Access model
- Page gate: `isRecordingsVisible(user)` — all-access/founder, any user with a linked
  `vaId`, or a gate-reviewer role (HR Manager / People-Ops / Recruiter). Kill-switched
  entirely by `RECORDINGS_ENABLED=false`.
- Per-recording gate: `canSeeRecording()` — admin or the uploader always; the owning
  VA and their direct supervisor see it once it's non-`private`; gate-reviewers see
  any non-`private` recording; a `link`-visibility recording is additionally
  reachable by anyone holding its `shareToken`, no login at all.
- Nav: the "Recordings" group renders wherever `showRecordings` is passed — every
  Sidebar view and the VA top nav — not just one console.

### Status lifecycle
`uploading` → (client PUTs to R2) → `finalize` sets `ready` + `aiStatus="pending"` →
worker sets `aiStatus` `running` → `done`/`failed`/`skipped`. Playback works as soon
as the row is `ready`; AI never blocks it.

---

## Deferred ⏳ (schema ready — not yet built)

1. **Candidate 10-hr recruitment integration.** Fields exist
   (`Recording.candidateId`, `Candidate.tenhrRecordingId`; `tenhrLoomUrl` kept as
   fallback). To enable: `api/recordings/candidate/{create,finalize}` keyed by
   `Candidate.trainingAccessToken` (stage `tenhr_in_progress`), an in-app recorder
   option in `track/[token]` (`TrackClient.tsx`), and surface the recording in the
   gate read (`src/lib/reads/recruitment.ts`) + gate page.

2. **HR review queue page** `(app)/hr/recordings`. Today everyone browses their own
   view of `/recordings` (filtered by `canSeeRecording`); build a dedicated filtered
   review queue if HR/supervisors want one place to see everything awaiting review.

3. **Public comments / reactions on a shared link.** The `/watch/[token]` viewer is
   read-only by design (an anonymous commenter is a spam surface nobody asked for
   yet). If wanted later: a `public/comment` route mirroring `public/get`, gated by
   requiring a display name and probably a rate limit.

4. **Rotate a share link.** `updateRecording` only ever mints a token once per
   recording (reused on every later save). Add an explicit "rotate" action if a
   leaked/over-shared link ever needs to be invalidated without losing `link`
   visibility entirely (switching visibility away and back doesn't clear the old
   token today — worth a look if this is needed).

5. **Nice-to-haves:** multipart upload for very long videos, a floating recorder pill,
   server-side ffmpeg thumbnail generation, viewer analytics. (Audio extraction for AI is
   now done — see "AI processing" below.)

---

## Setup / ops

1. **Install deps:** `npm install` (adds `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`).
2. **Migrate:** `npm run prisma:dev -- --name add_recordings` (dev) / `npm run prisma:migrate` (prod).
3. **R2 bucket:** create a bucket + API token; set the `R2_*` env vars. Add a CORS rule
   allowing `PUT` (and `GET`/`HEAD`) from the app origin, with `Content-Type` in
   `AllowedHeaders` and `ExposeHeaders: ["ETag"]` — direct browser upload fails silently
   without it. Playback uses the stream proxy, so GET CORS isn't strictly required for `<video>`.
4. **AI processing (optional):** transcripts + summaries come from a cheap OpenRouter
   multimodal model fed ffmpeg-extracted audio (so it works for full-length recordings,
   not just clips under Whisper's 25 MB cap). Requirements:
   - **ffmpeg on the host** (`apt install -y ffmpeg` on the VPS). The worker extracts a
     compact mono 16 kHz mp3 from the video before transcribing. No ffmpeg → the run
     no-ops and rows stay `pending` until it's installed.
   - **`OPENROUTER_API_KEY`** (the shared key — already on the VPS via
     `/etc/secondbrain/openrouter.env`). `OPENROUTER_TRANSCRIBE_MODEL` defaults to
     `google/gemini-2.5-flash-lite` (audio-in, JSON-out, ~$0.003 per 30-min recording;
     returns timestamped segments for click-to-seek). No key → `aiStatus="skipped"`.
   - Schedule `npm run worker:recordings` every 1–2 min (cron/systemd timer) or run on
     demand. The worker claims each row atomically (`pending`→`running`) and re-queues
     rows wedged in `running` for >15 min, so overlapping runs are safe. Playback never
     waits on AI.

## Verify end-to-end
- As any staff user with a linked VA (or HR/People-Ops/Recruiter/all-access), open
  `/record` in desktop Chrome → record ~20s with the webcam bubble → review → Save →
  lands on `/recordings/<id>` → play & scrub.
- As a client-portal login, confirm `/record`/`/recordings`/the mutation API routes
  still deny, but `comment` still works on a video shared to their org.
- Set visibility to "Link", Save, copy the generated link, open it in a private/
  logged-out browser tab → plays with title/summary/transcript, no login prompt.
  Switch visibility away from "Link" → the same link 404s.
- Run `npm run worker:recordings` after an upload → transcript/summary populate, `aiStatus="done"`.

## Go-live runbook (VPS)

Ordered steps to take this live for the whole team. R2 must be enabled first.

1. **Enable R2** (dashboard, one-time): Cloudflare → R2 → Enable (needs a billing
   profile; 10 GB free tier). Can't be done via API.
2. **Bucket + CORS** (scriptable with the stored global key, or dashboard): create bucket
   `va-recordings`; CORS rule — `AllowedOrigins: ["https://dev-team.pwasecondbrain.uk"]`,
   `AllowedMethods: ["PUT","GET","HEAD"]`, `AllowedHeaders: ["content-type"]`,
   `ExposeHeaders: ["ETag"]`. (Add `http://localhost:3032` to origins for local upload tests.)
3. **S3 API token**: R2 → Manage R2 API Tokens → Object Read & Write, scoped to the bucket
   → copy the Access Key ID + Secret Access Key.
4. **Env** → append to `shared/.env.production` on the VPS:
   ```
   R2_ACCOUNT_ID=b5d56e79af8c729a982e3e14f81aaad5
   R2_ENDPOINT=https://b5d56e79af8c729a982e3e14f81aaad5.r2.cloudflarestorage.com
   R2_BUCKET=va-recordings
   R2_ACCESS_KEY_ID=<from step 3>
   R2_SECRET_ACCESS_KEY=<from step 3>
   ```
   (OpenRouter for transcripts comes from `/etc/secondbrain/openrouter.env`, already wired
   into the web + recordings units — no per-app key needed.)
5. **ffmpeg on the host** (one-time): `ssh root@74.208.40.108 "apt-get install -y ffmpeg"`.
6. **Deploy**: `./deploy.sh` (rsync → npm ci → prisma migrate deploy → build → restart).
7. **Recordings worker timer** (one-time install of the units in `deploy/systemd/`):
   ```
   scp deploy/systemd/va-management-recordings.{service,timer} root@74.208.40.108:/etc/systemd/system/
   ssh root@74.208.40.108 "systemctl daemon-reload && systemctl enable --now va-management-recordings.timer"
   ```
8. **Smoke**: open `/record` at dev-team.pwasecondbrain.uk (any linked VA login now works),
   record a short clip, Save → plays back from R2; within ~2 min the transcript/summary
   populate. Also smoke-test a "Link" share: Save with visibility "Link", open the copied
   URL in a logged-out tab, confirm it plays.
