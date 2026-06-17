# va-world

A Gather.town-style 2D virtual space for our VAs — walk around a shared office,
bump into teammates, and start spontaneous proximity video/audio conversations,
with a meeting room and an event stage.

`va-world` is a **separate deployable** that lives in this monorepo alongside the
VA management app (the same way `worker/` and the Next web app coexist). It has
its own `package.json`, its own process/port, and will get its own systemd unit.

There is exactly **one** link to the management app: avatars are bound to real VA
profiles. The world reads VA identity (read-only) from the manager's
`/api/external/va-profile` bridge, keyed by the Cloudflare Access email — it never
writes back.

## Status

**Phase 3 (current): proximity audio/video via LiveKit Cloud.**
- Everyone joins a single LiveKit room; the client subscribes to a peer's
  tracks only when avatars are within range and fades audio volume with
  distance. Mic/cam are user-toggled from a React overlay (control bar + video
  tiles) layered over the Phaser canvas.
- The Colyseus server mints a LiveKit token per connection (identity = the
  session id) so each A/V participant maps to a synced position. If LiveKit
  isn't configured, no token is sent and the overlay stays hidden — the rest of
  the world still works.

Earlier: Phase 2 (multiplayer + VA identity binding), Phase 0–1 (scaffold +
single-player world). Later: meeting/stage zones (4), polish (5), deploy (6).

## Develop

```bash
cd va-world
npm install
cp .env.example .env        # set MANAGER_BASE_URL + EXTERNAL_APP_SECRET to bind real VAs

# Server (Colyseus) — terminal 1
npm run dev:server

# Client (Phaser/Vite) — terminal 2
npm run dev:client
```

Open **two** browser tabs to see multiplayer. In dev (no Cloudflare Access),
pick each tab's identity with a query param:

```
http://localhost:5180/?email=va-a@example.com
http://localhost:5180/?email=va-b@example.com
```

Each avatar shows the VA's name/tier from the manager (or a guest label if the
email isn't a VA / the bridge isn't configured). Walk with **WASD** / arrows.

To exercise **proximity A/V**, set `LIVEKIT_URL` / `LIVEKIT_API_KEY` /
`LIVEKIT_API_SECRET` in `.env` (free project at https://cloud.livekit.io), then
walk two avatars together: the video tiles appear and audio gets louder as they
approach, and fades to silent past the proximity radius. Mic/cam are off until
toggled (browsers require a user gesture to start capture).

## Checks

```bash
npm run typecheck   # tsc --noEmit over client + server + tests
npm run build       # vite production build of the client
npm test            # node:test unit tests (identity, manager bridge, proximity, livekit token)
```

A local multiplayer smoke test (no LiveKit needed):

```bash
PORT=2570 npm run dev:server          # terminal 1 (MANAGER_BASE_URL unset → guests)
PORT=2570 npx tsx scripts/smoke.mts   # terminal 2
```

## Layout

```
client/   Phaser game (Vite). scenes/, world/, net/ (colyseus.js), media/ (proximity + LiveKit), ui/ (React overlay)
server/   Colyseus server. rooms/, state/, identity.ts, manager.ts, livekit.ts, env.ts
tests/    node:test unit tests
```
