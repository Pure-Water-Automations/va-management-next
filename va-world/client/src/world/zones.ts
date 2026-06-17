// Single source of truth for A/V zones. Pure + DOM-free so the Colyseus server
// can import this same file (via a relative path) to stay authoritative about
// which LiveKit room a player may join — geometry never drifts between the two.
//
// Coordinates are in world pixels. Zones are axis-aligned tile rectangles laid
// over open floor (see tilemap.ts); the bands below are verified walkable.

import { TILE_SIZE } from "./tilemap";

export type RoomMode = "proximity" | "full";

export type ZoneAssignment = {
  /** LiveKit room name to join for this position. */
  room: string;
  /** "proximity" = distance-based (open floor); "full" = everyone, volume 1. */
  mode: RoomMode;
  /** Whether the player may publish mic/cam here (false = listen-only audience). */
  canPublish: boolean;
  /** Human label shown in the overlay. */
  label: string;
};

export type ZoneRect = {
  /** Inclusive tile-column/row bounds. */
  col0: number;
  row0: number;
  col1: number;
  row1: number;
};

const rectPx = (r: ZoneRect) => ({
  x: r.col0 * TILE_SIZE,
  y: r.row0 * TILE_SIZE,
  w: (r.col1 - r.col0 + 1) * TILE_SIZE,
  h: (r.row1 - r.row0 + 1) * TILE_SIZE,
});

/** Bottom open band → one private meeting call. */
export const MEETING_RECT: ZoneRect = { col0: 1, row0: 15, col1: 22, row1: 16 };
/** Top open band → the stage / event area (audience). */
export const STAGE_RECT: ZoneRect = { col0: 1, row0: 1, col1: 22, row1: 2 };
/** Podium within the stage → speakers (may publish to the whole stage). */
export const PODIUM_RECT: ZoneRect = { col0: 10, row0: 1, col1: 13, row1: 2 };

export const MEETING_ROOM = "meeting-1";
export const STAGE_ROOM = "stage";
export const WORLD_ROOM = "world";

/** Visual overlays the client renders (with a tint + label). */
export const ZONE_OVERLAYS = [
  { rect: MEETING_RECT, label: "Meeting Room", color: 0x2dd4bf },
  { rect: STAGE_RECT, label: "Stage", color: 0xf59e0b },
] as const;

export { rectPx };

function inRect(col: number, row: number, r: ZoneRect): boolean {
  return col >= r.col0 && col <= r.col1 && row >= r.row0 && row <= r.row1;
}

/**
 * Decide which LiveKit room + rules apply to a world position. The server calls
 * this with the authoritative player position so a meeting can't be joined from
 * outside it.
 */
export function zoneRoomFor(x: number, y: number): ZoneAssignment {
  const col = Math.floor(x / TILE_SIZE);
  const row = Math.floor(y / TILE_SIZE);

  if (inRect(col, row, MEETING_RECT)) {
    return { room: MEETING_ROOM, mode: "full", canPublish: true, label: "Meeting Room" };
  }
  if (inRect(col, row, STAGE_RECT)) {
    const onPodium = inRect(col, row, PODIUM_RECT);
    return {
      room: STAGE_ROOM,
      mode: "full",
      canPublish: onPodium,
      label: onPodium ? "Stage — speaking" : "Stage — audience",
    };
  }
  return { room: WORLD_ROOM, mode: "proximity", canPublish: true, label: "Open floor" };
}
