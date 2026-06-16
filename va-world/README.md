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

**Phase 0–1 (current): scaffold + runnable single-player world.**
- Phaser client: tile world, WASD/arrow movement, wall collision, follow-camera.
- Colyseus server: a stub `WorldRoom` (logs join/leave) ready for multiplayer.
- Placeholder art is generated at runtime — no binary assets yet.

Later phases: multiplayer + VA identity binding (2), proximity A/V via LiveKit
Cloud (3), meeting/stage zones (4), polish (5), deploy (6). See the plan for detail.

## Develop

```bash
cd va-world
npm install

# Client (Phaser) — opens a Vite dev server
npm run dev:client

# Server (Colyseus) — in a second terminal
npm run dev:server
```

In Phase 0–1 the client does **not** connect to the server yet; both are run to
prove the dev loop. Walk the avatar with **WASD** or the **arrow keys**.

## Checks

```bash
npm run typecheck   # tsc --noEmit over client + server
npm run build       # vite production build of the client
```

## Layout

```
client/   Phaser game (Vite). scenes/, world/ (tilemap + placeholder textures)
server/   Colyseus server. rooms/WorldRoom.ts (stub for Phase 2)
```
