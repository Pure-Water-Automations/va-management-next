import { test } from "node:test";
import assert from "node:assert/strict";
import { TILE_SIZE } from "../client/src/world/tilemap";
import {
  MEETING_ROOM,
  STAGE_ROOM,
  WORLD_ROOM,
  zoneRoomFor,
} from "../client/src/world/zones";

// Helper: center pixel of a tile column/row.
const at = (col: number, row: number) => ({
  x: col * TILE_SIZE + TILE_SIZE / 2,
  y: row * TILE_SIZE + TILE_SIZE / 2,
});

test("open floor is the proximity world room", () => {
  const z = zoneRoomFor(at(11, 10).x, at(11, 10).y);
  assert.equal(z.room, WORLD_ROOM);
  assert.equal(z.mode, "proximity");
  assert.equal(z.canPublish, true);
});

test("the bottom band is the private meeting room (full, publish)", () => {
  const z = zoneRoomFor(at(5, 15).x, at(5, 15).y);
  assert.equal(z.room, MEETING_ROOM);
  assert.equal(z.mode, "full");
  assert.equal(z.canPublish, true);
});

test("the podium is a stage speaker (full, publish)", () => {
  const z = zoneRoomFor(at(11, 1).x, at(11, 1).y);
  assert.equal(z.room, STAGE_ROOM);
  assert.equal(z.mode, "full");
  assert.equal(z.canPublish, true);
  assert.equal(z.label, "Stage — speaking");
});

test("the stage off the podium is a listen-only audience", () => {
  const z = zoneRoomFor(at(3, 1).x, at(3, 1).y);
  assert.equal(z.room, STAGE_ROOM);
  assert.equal(z.mode, "full");
  assert.equal(z.canPublish, false);
  assert.equal(z.label, "Stage — audience");
});
