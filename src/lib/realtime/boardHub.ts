// In-process pub/sub hub for live whiteboard collaboration.
//
// Transport is SSE (downstream, one long-lived GET per client) + POST (upstream ops).
// State lives in this Node process — fine for the single-instance systemd deployment;
// it does NOT fan out across multiple app replicas. Stored on globalThis so Next.js
// dev HMR / route-module reloads don't spawn a second, disconnected hub.

export type BoardUser = { userId: string; name: string; color: string };

type Conn = BoardUser & {
  connId: string;
  enqueue: (line: string) => boolean; // returns false if the socket is dead
};

type Room = Map<string, Conn>; // connId -> Conn

const g = globalThis as unknown as { __boardHub?: Map<string, Room> };
const rooms: Map<string, Room> = g.__boardHub ?? (g.__boardHub = new Map());

function room(boardId: string): Room {
  let r = rooms.get(boardId);
  if (!r) {
    r = new Map();
    rooms.set(boardId, r);
  }
  return r;
}

/** Deterministic per-user avatar/cursor colour (mirrors the client AVCOL palette). */
const PALETTE = ["#2ab0d8", "#7c5cbf", "#5b8def", "#2fa37a", "#c2772f", "#b5495b", "#1a278a"];
export function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

function frame(event: unknown): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

/** Distinct users currently on a board (deduped by userId), for the presence snapshot. */
export function presence(boardId: string): BoardUser[] {
  const r = rooms.get(boardId);
  if (!r) return [];
  const seen = new Map<string, BoardUser>();
  for (const c of r.values()) if (!seen.has(c.userId)) seen.set(c.userId, { userId: c.userId, name: c.name, color: c.color });
  return [...seen.values()];
}

/** Send an event to every connection in a board except `exceptConnId`. */
export function publish(boardId: string, exceptConnId: string | null, event: unknown): void {
  const r = rooms.get(boardId);
  if (!r) return;
  const line = frame(event);
  for (const c of r.values()) {
    if (c.connId === exceptConnId) continue;
    if (!c.enqueue(line)) r.delete(c.connId); // drop dead sockets
  }
}

export function join(boardId: string, conn: Conn): void {
  room(boardId).set(conn.connId, conn);
  // Tell everyone (including the joiner) the fresh presence roster.
  publish(boardId, null, { t: "presence", users: presence(boardId) });
}

export function leave(boardId: string, connId: string): void {
  const r = rooms.get(boardId);
  if (!r) return;
  r.delete(connId);
  // Remove the leaver's cursor everywhere, then refresh the roster.
  publish(boardId, null, { t: "leave", connId });
  publish(boardId, null, { t: "presence", users: presence(boardId) });
  if (r.size === 0) rooms.delete(boardId);
}
