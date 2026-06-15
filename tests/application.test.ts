import test from "node:test";
import assert from "node:assert/strict";

import {
  validateApplication,
  isVisible,
  candidateFieldsFromAnswers,
  APPLICATION_QUESTIONS,
} from "../src/lib/application-questions";

const base = {
  email: "jane@example.com",
  firstName: "Jane",
  lastName: "Cruz",
  address: "Manila, PH",
  community: "Antipolo",
  hasVaExperience: "yes",
  vaExperienceDesc: "Chat support and scheduling",
  resumeUrl: "https://drive.google.com/abc",
  skills: "Scheduling, research",
  timezone: "UTC+8 (Manila, Singapore, China)",
  availability: "9am-5pm US Eastern",
  comfortableUsClients: "yes",
  hasComputer: "yes",
  internetType: "Fiber",
  internetSpeed: "50 Mbps",
  quietWorkspace: "yes",
  headsetMic: "yes",
  backupOption: "Mobile hotspot",
};

test("a complete application validates", () => {
  const r = validateApplication(base);
  assert.equal(r.ok, true);
});

test("branching: VA-experience description required only when hasVaExperience=yes", () => {
  const expQ = APPLICATION_QUESTIONS.find((q) => q.key === "vaExperienceDesc")!;
  const adminQ = APPLICATION_QUESTIONS.find((q) => q.key === "adminExperienceDesc")!;
  assert.equal(isVisible(expQ, { hasVaExperience: "yes" }), true);
  assert.equal(isVisible(expQ, { hasVaExperience: "no" }), false);
  assert.equal(isVisible(adminQ, { hasVaExperience: "no" }), true);
  assert.equal(isVisible(adminQ, { hasVaExperience: "yes" }), false);
});

test("when hasVaExperience=no, the admin-experience branch is the required one", () => {
  const noExp = { ...base, hasVaExperience: "no", vaExperienceDesc: "" } as Record<string, unknown>;
  // missing adminExperienceDesc → should fail
  assert.equal(validateApplication(noExp).ok, false);
  const fixed = validateApplication({ ...noExp, adminExperienceDesc: "Office assistant 3 yrs" });
  assert.equal(fixed.ok, true);
});

test("missing required field fails with a helpful message", () => {
  const r = validateApplication({ ...base, email: "" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /email/i);
});

test("invalid email and resume link are rejected", () => {
  assert.equal(validateApplication({ ...base, email: "nope" }).ok, false);
  assert.equal(validateApplication({ ...base, resumeUrl: "drive.google.com/abc" }).ok, false);
});

test("optional pastor field can be blank", () => {
  const r = validateApplication({ ...base, pastor: "" });
  assert.equal(r.ok, true);
});

test("candidateFieldsFromAnswers maps name/email/skills/resume", () => {
  const r = validateApplication(base);
  assert.equal(r.ok, true);
  if (r.ok) {
    const f = candidateFieldsFromAnswers(r.answers);
    assert.equal(f.name, "Jane Cruz");
    assert.equal(f.email, "jane@example.com");
    assert.equal(f.skillsRoleTags, "Scheduling, research");
    assert.equal(f.resumeUrl, "https://drive.google.com/abc");
  }
});
