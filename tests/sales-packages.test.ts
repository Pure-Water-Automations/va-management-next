import test from "node:test";
import assert from "node:assert/strict";

import { PACKAGES, LADDER, pkgByName, nextPkgOf, compactMoney, pkgOptionLabel } from "../src/lib/sales/packages";

test("pkgByName is case/whitespace-insensitive and null-safe", () => {
  assert.equal(pkgByName(" stream ")?.name, "Stream");
  assert.equal(pkgByName("OCEAN PLUS")?.name, "Ocean Plus");
  assert.equal(pkgByName("nope"), null);
  assert.equal(pkgByName(null), null);
  assert.equal(pkgByName(undefined), null);
});

test("upgrade ladder: Hourly → Spring, each tier steps up, top and Custom dead-end", () => {
  assert.equal(nextPkgOf("Hourly")?.name, "Spring");
  assert.equal(nextPkgOf("Spring")?.name, "Stream");
  assert.equal(nextPkgOf("Ocean")?.name, "Ocean Plus");
  assert.equal(nextPkgOf("Ocean Enterprise"), null); // top of the ladder
  assert.equal(nextPkgOf("Custom"), null); // not on the ladder
  assert.equal(nextPkgOf(null), null);
});

test("every ladder tier is a priced package", () => {
  for (const name of LADDER) {
    const p = pkgByName(name);
    assert.ok(p && p.price != null && p.hours != null, `${name} must be priced`);
  }
  assert.equal(PACKAGES.length, 8);
});

test("compactMoney: $ under 1k, k-notation at 1k+", () => {
  assert.equal(compactMoney(800), "$800");
  assert.equal(compactMoney(1400), "$1.4k");
  assert.equal(compactMoney(2000), "$2k");
  assert.equal(compactMoney(4700), "$4.7k");
});

test("pkgOptionLabel covers hourly, priced, and unpriced shapes", () => {
  assert.equal(pkgOptionLabel(pkgByName("Hourly")!), "Hourly — $10/hr");
  assert.equal(pkgOptionLabel(pkgByName("Stream")!), "Stream — $800/mo · 68 hrs");
  assert.equal(pkgOptionLabel(pkgByName("Custom")!), "Custom");
});
