import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRedirectTarget } from "../src/lib/email";

test("actor mode off → fixed redirect address", () => {
  assert.equal(
    resolveRedirectTarget({ redirectTo: "riza@x.com", actorMode: false, actorEmail: "aira@x.com" }),
    "riza@x.com",
  );
});

test("actor mode off + no address → no redirect (real recipient)", () => {
  assert.equal(resolveRedirectTarget({ redirectTo: null, actorMode: false }), null);
});

test("actor mode on → redirect to the acting user", () => {
  assert.equal(
    resolveRedirectTarget({ redirectTo: "riza@x.com", actorMode: true, actorEmail: "aira@x.com" }),
    "aira@x.com",
  );
});

test("actor mode on + no actor → falls back to the catch-all", () => {
  assert.equal(
    resolveRedirectTarget({ redirectTo: "riza@x.com", actorMode: true, actorEmail: undefined }),
    "riza@x.com",
  );
});

test("actor mode on + no actor + no catch-all → no redirect", () => {
  assert.equal(resolveRedirectTarget({ redirectTo: null, actorMode: true, actorEmail: "" }), null);
});
