import test from "node:test";
import assert from "node:assert/strict";

import {
  validateDiscovery,
  dealFieldsFromAnswers,
  estimateAdminCost,
  fitVerdict,
  DISCOVERY_QUESTIONS,
  ROLE_OPTIONS,
} from "../src/lib/discovery-questions";

const base = {
  fullName: "Pastor Daniel Kim",
  orgName: "Riverside Community Church",
  role: "Pastor / Faith Leader",
  email: "dkim@riverside.org",
  teamSize: "6–15",
  mission: "Help our city's families find belonging and hope.",
  painTags: "Scheduling, Admin & email",
  hoursPerWeek: "10–20",
  budgetAvailable: "Yes",
  timeline: "ASAP",
  heardAbout: "Referral from a colleague",
};

test("a complete discovery submission validates", () => {
  const r = validateDiscovery(base);
  assert.equal(r.ok, true);
});

test("role must be one of the offered options", () => {
  assert.ok(ROLE_OPTIONS.includes("Founder / CEO"));
  const r = validateDiscovery({ ...base, role: "Wizard" });
  assert.equal(r.ok, false);
});

test("missing required field fails with a helpful message", () => {
  const r = validateDiscovery({ ...base, email: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /email/i);
});

test("invalid email is rejected", () => {
  assert.equal(validateDiscovery({ ...base, email: "nope" }).ok, false);
});

test("optional fields can be blank", () => {
  const r = validateDiscovery({ ...base, phone: "", painMore: "", triedBefore: "", availability: "" });
  assert.equal(r.ok, true);
});

test("optional call availability is retained in validated discovery answers", () => {
  const r = validateDiscovery({ ...base, availability: "Tuesdays after 3 PM Eastern" });
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.answers.availability, "Tuesdays after 3 PM Eastern");
});

test("dealFieldsFromAnswers maps org/contact + promoted columns", () => {
  const r = validateDiscovery(base);
  assert.equal(r.ok, true);
  if (r.ok) {
    const f = dealFieldsFromAnswers(r.answers);
    assert.equal(f.orgName, "Riverside Community Church");
    assert.equal(f.contactName, "Pastor Daniel Kim");
    assert.equal(f.contactEmail, "dkim@riverside.org");
    assert.equal(f.budgetAvailable, "yes");
    assert.deepEqual(f.painTags, ["Scheduling", "Admin & email"]);
    assert.equal(f.hoursPerWeek, "10–20");
  }
});

test("estimateAdminCost uses band midpoint × rate × 52", () => {
  // "10–20" → midpoint 15h; 15 × 25 × 52 = 19500
  assert.equal(estimateAdminCost("10–20", 25), 19500);
  assert.equal(estimateAdminCost("Under 5", 25), 3900); // 3h
  assert.equal(estimateAdminCost("20+", 25), 32500); // 25h
  assert.equal(estimateAdminCost("nonsense", 25), 0);
});

test("fitVerdict: decision-maker + budget + urgency + hours = hot", () => {
  assert.equal(fitVerdict(base), "hot");
});

test("fitVerdict: no budget = cold regardless of other signals", () => {
  assert.equal(fitVerdict({ ...base, budgetAvailable: "No" }), "cold");
});

test("fitVerdict: just exploring with low hours = cold", () => {
  assert.equal(fitVerdict({ ...base, timeline: "Just exploring", hoursPerWeek: "Under 5" }), "cold");
});

test("every question has a unique key", () => {
  const keys = DISCOVERY_QUESTIONS.map((q) => q.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("fitVerdict: strong signals but a non-decision-maker is at most warm", () => {
  // budget Yes + hours 10–20 + timeline ASAP, but Operations/Admin is not the buyer.
  assert.equal(fitVerdict({ ...base, role: "Operations / Admin" }), "warm");
});
