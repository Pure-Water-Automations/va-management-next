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

**Phase 4 (current): meeting room + event stage zones.**
- Two tagged floor regions change the A/V rules, each backed by its **own**
  LiveKit room (privacy can't be done with subscription tricks in one shared
  room):
  - **Meeting Room** (bottom band) — everyone inside shares one private call at
    full volume regardless of distance; the open floor can't hear them.
  - **Stage** (top band) — stand on the **podium** to be heard across the whole
    stage; anyone else there is a listen-only **audience** (mic/cam disabled).
- The server is authoritative about which room you may join: it watches your
  position and, when your zone (or stage role) changes, mints a new token and
  the client switches rooms. Open floor stays proximity-based (Phase 3).

Earlier: Phase 3 (proximity A/V), Phase 2 (multiplayer + VA identity), Phase 0–1
(scaffold). Later: polish (5), deploy (6).

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

To exercise **A/V**, set `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET`
in `.env` (free project at https://cloud.livekit.io). Then with two avatars:

- **Open floor** — walk together: tiles appear and audio gets louder as they
  approach, fading to silent past the proximity radius.
- **Meeting Room** (bottom band) — both walk in: they hear each other at full
  volume even far apart, and an avatar left on the open floor can't hear them.
- **Stage** (top band) — stand on the center **podium** to broadcast to everyone
  on the stage; off the podium you're a listen-only audience (mic/cam disabled).

Mic/cam are off until toggled (browsers require a user gesture to start capture).

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
