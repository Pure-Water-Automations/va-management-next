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
| AI | Whisper transcript + chat title/summary worker (best-effort, non-blocking) | `worker/recordings-process.ts` (`npm run worker:recordings`) |

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
   server-side ffmpeg thumbnails/audio extraction (Whisper 25 MB limit), viewer analytics.

---

## Setup / ops

1. **Install deps:** `npm install` (adds `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`).
2. **Migrate:** `npm run prisma:dev -- --name add_recordings` (dev) / `npm run prisma:migrate` (prod).
3. **R2 bucket:** create a bucket + API token; set the `R2_*` env vars. Add a CORS rule
   allowing `PUT` (and `GET`/`HEAD`) from the app origin, with `Content-Type` in
   `AllowedHeaders` and `ExposeHeaders: ["ETag"]` — direct browser upload fails silently
   without it. Playback uses the stream proxy, so GET CORS isn't strictly required for `<video>`.
4. **AI (optional):** `OPENAI_API_KEY` enables transcript/summary; `OPENAI_TRANSCRIBE_MODEL`
   defaults to `whisper-1`. Schedule `npm run worker:recordings` every 1–2 min (cron),
   or run on demand. Without a key, `aiStatus` becomes `skipped` and playback is unaffected.

## Verify end-to-end
- As an admin (`DEV_AUTH_EMAIL`), open `/record` in desktop Chrome → record ~20s with the
  webcam bubble → review → Save → lands on `/recordings/<id>` → play & scrub.
- As a non-admin, confirm `/record`, `/recordings`, and the API routes 404/deny and the
  sidebar group is hidden.
- Run `npm run worker:recordings` after an upload → transcript/summary populate, `aiStatus="done"`.
