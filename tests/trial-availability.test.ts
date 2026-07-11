import assert from "node:assert/strict";
import test from "node:test";
import { isWithinDeclaredWindow, timezoneOffsetMinutes } from "../src/lib/trial/engine";

test("parses stored GMT offsets, including half-hour offsets", () => {
  assert.equal(timezoneOffsetMinutes("GMT+8 — Manila"), 480);
  assert.equal(timezoneOffsetMinutes("GMT-05:00 — New York"), -300);
  assert.equal(timezoneOffsetMinutes("GMT+5:30 — India"), 330);
  assert.equal(timezoneOffsetMinutes("America/New_York"), 0);
});

test("declared windows use candidate-local weekday and half-open time blocks", () => {
  const days = ["Mon"];
  const timezone = "GMT+8 — Manila";
  assert.equal(isWithinDeclaredWindow(new Date("2026-07-12T22:00:00.000Z"), timezone, days, "Morning"), true); // Mon 06:00
  assert.equal(isWithinDeclaredWindow(new Date("2026-07-13T03:59:59.000Z"), timezone, days, "Morning"), true);
  assert.equal(isWithinDeclaredWindow(new Date("2026-07-13T04:00:00.000Z"), timezone, days, "Morning"), false); // Mon 12:00
  assert.equal(isWithinDeclaredWindow(new Date("2026-07-13T04:00:00.000Z"), timezone, days, "Afternoon"), true);
  assert.equal(isWithinDeclaredWindow(new Date("2026-07-13T10:00:00.000Z"), timezone, days, "Evening"), true); // Mon 18:00
  assert.equal(isWithinDeclaredWindow(new Date("2026-07-14T10:00:00.000Z"), timezone, days, "Evening"), false); // Tue
});
