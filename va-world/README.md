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

**Phase 2 (current): authoritative multiplayer + VA identity binding.**
- Phaser client connects to the Colyseus server, renders every player as a
  sprite with a floating **name + tier** label, and interpolates remote avatars.
- Colyseus server owns the player map; clients send throttled positions. On
  join it resolves the player's email (Cloudflare Access header → dev `?email=`
  → env fallback) and calls the manager's `/api/external/va-profile` bridge to
  bind the avatar to a real VA. Unresolved users render as labeled guests.
- Placeholder art is still generated at runtime — no binary assets yet.

Earlier: Phase 0–1 (scaffold + single-player world). Later: proximity A/V via
LiveKit Cloud (3), meeting/stage zones (4), polish (5), deploy (6).

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

## Checks

```bash
npm run typecheck   # tsc --noEmit over client + server + tests
npm run build       # vite production build of the client
npm test            # node:test unit tests (identity resolution, manager bridge)
```

## Layout

```
client/   Phaser game (Vite). scenes/, world/, net/ (colyseus.js client)
server/   Colyseus server. rooms/WorldRoom.ts, state/, identity.ts, manager.ts, env.ts
tests/    node:test unit tests
```
