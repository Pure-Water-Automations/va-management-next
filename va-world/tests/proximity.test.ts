import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PROXIMITY_RADIUS,
  distance,
  proximityVolume,
  withinRadius,
} from "../client/src/media/proximity";

test("distance is euclidean", () => {
  assert.equal(distance({ x: 0, y: 0 }, { x: 3, y: 4 }), 5);
});

test("withinRadius respects the boundary", () => {
  assert.equal(withinRadius(0), true);
  assert.equal(withinRadius(PROXIMITY_RADIUS), true);
  assert.equal(withinRadius(PROXIMITY_RADIUS + 1), false);
  assert.equal(withinRadius(50, 40), false);
});

test("proximityVolume falls off linearly to zero at the radius", () => {
  assert.equal(proximityVolume(0), 1);
  assert.equal(proximityVolume(PROXIMITY_RADIUS), 0);
  assert.equal(proximityVolume(PROXIMITY_RADIUS + 100), 0);
  assert.equal(proximityVolume(PROXIMITY_RADIUS / 2), 0.5);
});
