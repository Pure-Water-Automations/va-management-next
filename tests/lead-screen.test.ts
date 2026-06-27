import test from "node:test";
import assert from "node:assert/strict";

import { leadBaseline, blendLead } from "../src/lib/services/lead-screen";

const hot = {
  fullName: "Daniel Kim",
  orgName: "Riverside",
  role: "Pastor / Faith Leader",
  email: "d@r.org",
  teamSize: "6–15",
  mission: "Serve our city.",
  painTags: "Scheduling",
  hoursPerWeek: "20+",
  budgetAvailable: "Yes",
  timeline: "ASAP",
  heardAbout: "Referral from a colleague",
};

test("baseline verdict tracks the fit heuristic", () => {
  assert.equal(leadBaseline(hot).verdict, "hot");
  assert.equal(leadBaseline({ ...hot, budgetAvailable: "No" }).verdict, "cold");
});

test("baseline flags an exploring, no-budget lead", () => {
  const b = leadBaseline({ ...hot, budgetAvailable: "No", timeline: "Just exploring" });
  assert.ok(b.flags.some((f) => /budget|funding/i.test(f)));
});

test("baseline score is higher for hot than cold", () => {
  assert.ok(leadBaseline(hot).score > leadBaseline({ ...hot, budgetAvailable: "No" }).score);
});

test("blendLead keeps a cold floor even if AI is optimistic", () => {
  const base = leadBaseline({ ...hot, budgetAvailable: "No" }); // cold
  const blended = blendLead({ verdict: "hot", score: 95, summary: "Great!", concerns: [] }, base);
  assert.equal(blended.verdict, "cold");
  assert.ok(blended.score <= 40);
});

test("blendLead uses the AI summary when present", () => {
  const base = leadBaseline(hot);
  const blended = blendLead({ verdict: "hot", score: 88, summary: "Strong fit.", concerns: ["needs board sign-off"] }, base);
  assert.equal(blended.summary, "Strong fit.");
  assert.ok(blended.flags.includes("needs board sign-off"));
});

test("blendLead never rates a lead higher than the deterministic baseline", () => {
  const base = leadBaseline(hot); // hot
  const blended = blendLead({ verdict: "warm", score: 80, summary: "Some open questions.", concerns: [] }, base);
  assert.equal(blended.verdict, "warm"); // AI's more conservative call wins
  assert.ok(blended.score >= 41 && blended.score <= 69); // clamped into the warm band
});
