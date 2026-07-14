# Recordings (in-app Loom-style screen recorder)

Browser-based screen + mic (+ webcam bubble) recording, stored in Cloudflare R2,
with an in-app player, AI transcript/summary, review workflow, and timestamped
comments. Built into the VA Management console.

**Status: admin-only preview.** Everything below ships gated to `User.isAdmin`.
Public/anonymous sharing and the candidate (recruitment) flow are intentionally
deferred — the database schema already carries their fields so enabling them later
needs no migration.

---

## Implemented ✓ (admin-only)

| Area | What | Where |
| --- | --- | --- |
| Schema | `Recording`, `RecordingComment`, enums `RecordingStatus`/`RecordingVisibility`; relations on `Va`/`Candidate`; `Candidate.tenhrRecordingId` | `prisma/schema.prisma` |
| Storage | Cloudflare R2 client, presigned upload/download, delete, server get/put, key helpers | `src/lib/r2.ts` |
| Env | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_BASE_URL`, `OPENAI_TRANSCRIBE_MODEL` | `src/lib/env.ts` |
| Logic | `createRecording`, `finalizeRecording`, `updateRecording`, `deleteRecording`, `addComment`, `reviewRecording`, `canSeeRecording` | `src/lib/actions/recordings.ts` |
| Reads | `listVisibleRecordings`, `getRecordingDetail` (+ presigned thumbnail/download) | `src/lib/reads/recordings.ts` |
| API (POST, admin-only via `allow:()=>false`) | `create`, `finalize`, `list`, `get`, `update`, `delete`, `comment`, `review` | `src/app/api/recordings/**/route.ts` |
| API (GET) | `stream/[id]` — auth-checked 302 to a presigned R2 URL (Range-friendly); `?download=1` for attachment | `src/app/api/recordings/stream/[id]/route.ts` |
| Recorder | screen+mic+webcam-bubble canvas compositor, MediaRecorder, pause/resume, length cap, thumbnail, presigned PUT upload w/ progress | `src/components/recorder/useScreenRecorder.ts`, `Recorder.tsx` |
| Player | video via stream proxy, AI summary, transcript w/ click-to-seek, comments + reactions, review controls, edit/delete | `src/components/recorder/RecordingDetailClient.tsx` |
| Pages | `/record`, `/recordings` (library), `/recordings/[id]` (player) — each `notFound()` for non-admins | `src/app/(app)/record`, `src/app/(app)/recordings` |
| Nav | admin-only "Recordings" group | `src/components/Sidebar.tsx` (+ `src/app/(app)/layout.tsx`) |
| AI | ffmpeg audio extraction → OpenRouter multimodal transcript + title/summary in one cheap call (best-effort, non-blocking) | `worker/recordings-process.ts` (`npm run worker:recordings`), `worker/lib/media.ts`, `src/lib/recordings/transcription.ts` |

### Admin gating
- API: `action(handler, { allow: () => false })` — non-admins denied, admins bypass (see `src/lib/api.ts`).
- Pages: `const user = await getCurrentUser(); if (!user.isAdmin) notFound();`.
- Nav: the "Recordings" group renders only when `isAdmin` is passed to `Sidebar`.

### Status lifecycle
`uploading` → (client PUTs to R2) → `finalize` sets `ready` + `aiStatus="pending"` →
worker sets `aiStatus` `running` → `done`/`failed`/`skipped`. Playback works as soon
as the row is `ready`; AI never blocks it.

---

## Deferred ⏳ (schema ready — not yet built)

1. **Public share links / pages.** Fields exist (`Recording.shareToken`,
   `visibility="link"`). To enable: add `share`/`unshare` POST routes (mint/rotate
   `randomUUID()` token like `generateLink` in `src/lib/actions/training.ts`),
   public token routes `api/recordings/public/{get,comment,stream}` (hand-parsed,
   no `action()` — pattern in `src/app/api/training/state/route.ts`), and a public
   page `src/app/watch/[token]/` modeled on `src/app/track/[token]/`.

2. **Candidate 10-hr recruitment integration.** Fields exist
   (`Recording.candidateId`, `Candidate.tenhrRecordingId`; `tenhrLoomUrl` kept as
   fallback). To enable: `api/recordings/candidate/{create,finalize}` keyed by
   `Candidate.trainingAccessToken` (stage `tenhr_in_progress`), an in-app recorder
   option in `track/[token]` (`TrackClient.tsx`), and surface the recording in the
   gate read (`src/lib/reads/recruitment.ts`) + gate page.

3. **Broader role access.** Today admin-only. To open up: replace `allow: () => false`
   with real role predicates, drop the `if (!user.isAdmin) notFound()` page guards,
   and remove the `isAdmin` condition on the Sidebar group. `canSeeRecording` already
   encodes owner / HR / supervisor-chain visibility for when this happens.

4. **HR review queue page** `(app)/hr/recordings`. Admins currently see everything via
   `/recordings`; build a filtered review queue when access opens to HR/supervisors.

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
- As an admin (`DEV_AUTH_EMAIL`), open `/record` in desktop Chrome → record ~20s with the
  webcam bubble → review → Save → lands on `/recordings/<id>` → play & scrub.
- As a non-admin, confirm `/record`, `/recordings`, and the API routes 404/deny and the
  sidebar group is hidden.
- Run `npm run worker:recordings` after an upload → transcript/summary populate, `aiStatus="done"`.

## Go-live runbook (VPS)

Ordered steps to take this live as the admin-only preview. R2 must be enabled first.

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
8. **Smoke**: open `/record` at dev-team.pwasecondbrain.uk (as an allow-listed admin), record a
   short clip, Save → plays back from R2; within ~2 min the transcript/summary populate.
