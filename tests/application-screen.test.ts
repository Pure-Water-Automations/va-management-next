import test from "node:test";
import assert from "node:assert/strict";

import { looksLikeGibberish, baselineChecks } from "../src/lib/services/application-screen";

test("looksLikeGibberish catches mashes, repeats, and empties", () => {
  assert.equal(looksLikeGibberish(""), true);
  assert.equal(looksLikeGibberish("asdfasdf"), true);
  assert.equal(looksLikeGibberish("xkcdfghj"), true); // no vowels
  assert.equal(looksLikeGibberish("aaaaaa"), true);
  assert.equal(looksLikeGibberish("test test test"), true);
});

test("looksLikeGibberish accepts real (even brief, non-native) answers", () => {
  assert.equal(looksLikeGibberish("I worked as a chat support agent for 2 years."), false);
  assert.equal(looksLikeGibberish("Office assistant and scheduling"), false);
  assert.equal(looksLikeGibberish("Mobile hotspot as backup"), false);
});

const good = {
  resumeUrl: "https://drive.google.com/file/d/abc/view",
  vaExperienceDesc: "Two years of chat support and calendar management for an e-commerce store.",
  availability: "9am to 6pm Manila time, flexible evenings",
  backupOption: "I have a mobile data hotspot if the wifi goes down.",
};

test("a genuine application produces no flags and no hard fail", () => {
  const b = baselineChecks(good);
  assert.equal(b.hardFail, false);
  assert.equal(b.resumeOk, true);
  assert.deepEqual(b.flags, []);
});

test("missing/invalid resume link is flagged", () => {
  const b = baselineChecks({ ...good, resumeUrl: "my resume" });
  assert.equal(b.resumeOk, false);
  assert.ok(b.flags.some((f) => /resume/i.test(f)));
});

test("all-gibberish open answers hard-fail as junk", () => {
  const b = baselineChecks({
    resumeUrl: "https://x.co/a",
    vaExperienceDesc: "asdfasdf",
    availability: "jkjkjk",
    backupOption: "zzzz",
  });
  assert.equal(b.hardFail, true);
  assert.ok(b.gibberishFields.length >= 2);
});

test("a too-short experience answer is flagged low-effort", () => {
  const b = baselineChecks({ ...good, vaExperienceDesc: "none", adminExperienceDesc: "" });
  assert.equal(b.lowEffort, true);
});
