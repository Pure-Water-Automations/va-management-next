// Local integration smoke test for Phase 2 multiplayer sync.
//
//   Terminal 1:  PORT=2570 npm run dev:server        (MANAGER_BASE_URL unset → guests)
//   Terminal 2:  PORT=2570 npx tsx scripts/smoke.mts
//
// Connects two clients, verifies each sees the other, that a move propagates,
// and that guest identity is applied. Exits non-zero on failure.
import assert from "node:assert/strict";
import { Client } from "colyseus.js";

const PORT = process.env.PORT ?? "2567";
const ENDPOINT = `ws://localhost:${PORT}`;

async function waitFor(predicate: () => boolean, label: string, timeoutMs = 5000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error(`timeout waiting for: ${label}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

async function main() {
  const alice = await new Client(ENDPOINT).joinOrCreate("world", { email: "alice@example.com" });
  const bob = await new Client(ENDPOINT).joinOrCreate("world", { email: "bob@example.com" });

  await waitFor(
    () => alice.state.players.size >= 2 && bob.state.players.size >= 2,
    "both clients see 2 players",
  );

  alice.send("move", { x: 333, y: 222 });

  await waitFor(() => {
    const p = bob.state.players.get(alice.sessionId);
    return !!p && Math.abs(p.x - 333) < 1 && Math.abs(p.y - 222) < 1;
  }, "bob sees alice's moved position");

  const aliceInBob = bob.state.players.get(alice.sessionId);
  assert.ok(aliceInBob, "alice present in bob's state");
  assert.equal(aliceInBob.name, "alice");
  assert.equal(aliceInBob.tier, "GUEST");
  assert.equal(aliceInBob.isGuest, true);

  console.log("SMOKE OK: 2-client sync + move propagation + guest identity verified");
  await alice.leave();
  await bob.leave();
  process.exit(0);
}

main().catch((err) => {
  console.error("SMOKE FAILED:", err);
  process.exit(1);
});
