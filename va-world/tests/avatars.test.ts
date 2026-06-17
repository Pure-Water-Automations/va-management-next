import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AVATAR_COLORS,
  DEFAULT_AVATAR_COLOR,
  colorToTint,
  isValidColor,
  normalizeColor,
} from "../client/src/world/avatars";

test("isValidColor only accepts palette entries", () => {
  assert.equal(isValidColor(AVATAR_COLORS[1]), true);
  assert.equal(isValidColor("#123456"), false);
  assert.equal(isValidColor(123), false);
  assert.equal(isValidColor(undefined), false);
});

test("normalizeColor falls back to the default for junk", () => {
  assert.equal(normalizeColor(AVATAR_COLORS[2]), AVATAR_COLORS[2]);
  assert.equal(normalizeColor("not-a-color"), DEFAULT_AVATAR_COLOR);
  assert.equal(normalizeColor(null), DEFAULT_AVATAR_COLOR);
});

test("colorToTint converts #rrggbb to a number", () => {
  assert.equal(colorToTint("#2dd4bf"), 0x2dd4bf);
  assert.equal(colorToTint("#ffffff"), 0xffffff);
});
