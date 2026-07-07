import { test } from "node:test";
import assert from "node:assert/strict";
import { buildSpeakerCache, resolveSpeaker, roleLabel, type KnownPerson } from "../src/lib/zoom/identity";

const people: KnownPerson[] = [
  { id: "u1", name: "Aira Mangila", email: "aira@pwa.com", role: "HR_MANAGER" },
  { id: "u2", name: "Justin Okamoto", email: "justin@pwa.com", role: "TESTER" },
  { id: "u3", name: "Dan Cooper", email: "dan@client.com", role: "CLIENT_ADMIN" },
  { id: "u4", name: "Daniela Cruz", email: "daniela@pwa.com", role: "VA" },
  { id: "u5", name: null, email: "ghost@pwa.com", role: "VA" },
];

test("roleLabel: maps console roles to classifier labels", () => {
  assert.equal(roleLabel("CLIENT_ADMIN"), "client");
  assert.equal(roleLabel("CLIENT_MEMBER"), "client");
  assert.equal(roleLabel("VA"), "va");
  assert.equal(roleLabel("SENIOR_VA"), "va");
  assert.equal(roleLabel("TEAM_LEAD"), "team lead");
  assert.equal(roleLabel("HR_MANAGER"), "staff");
  assert.equal(roleLabel("TESTER"), "staff");
  assert.equal(roleLabel(null), "unknown");
  assert.equal(roleLabel("SOMETHING_NEW"), "unknown");
});

test("resolveSpeaker: exact normalized match", () => {
  const r = resolveSpeaker("aira mangila", people);
  assert.equal(r.userId, "u1");
  assert.equal(r.resolution, "exact");
  assert.equal(r.label, "staff");
});

test("resolveSpeaker: fuzzy first-name and initial matches", () => {
  const first = resolveSpeaker("Justin", people);
  assert.equal(first.userId, "u2");
  assert.equal(first.resolution, "fuzzy");

  const initial = resolveSpeaker("Justin O", people);
  assert.equal(initial.userId, "u2");

  const client = resolveSpeaker("Dan Cooper (Acme)", people);
  // Parenthetical suffixes break subsumption both ways unless tokens still line up.
  assert.ok(client.userId === "u3" || client.resolution === "unknown");
});

test("resolveSpeaker: ambiguity resolves to unknown, never a guess", () => {
  // "Dan" prefixes both Dan Cooper and Daniela Cruz → ambiguous → unknown.
  const r = resolveSpeaker("Dan", people);
  assert.equal(r.userId, null);
  assert.equal(r.resolution, "unknown");
});

test("resolveSpeaker: unknown names and empty input", () => {
  assert.equal(resolveSpeaker("Random Caller", people).resolution, "unknown");
  const empty = resolveSpeaker("", people);
  assert.equal(empty.resolution, "unknown");
  assert.equal(empty.display, "Unknown speaker");
});

test("buildSpeakerCache: one entry per distinct display name", () => {
  const cache = buildSpeakerCache(["Justin", "Justin", "Aira Mangila"], people);
  assert.equal(cache.size, 2);
  assert.equal(cache.get("Justin")?.userId, "u2");
});
