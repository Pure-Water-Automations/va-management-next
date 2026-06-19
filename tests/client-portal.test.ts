import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { viewForRole } from "../src/lib/auth/roles";

describe("viewForRole", () => {
  it("CLIENT_ADMIN → CLIENT", () => {
    assert.equal(viewForRole("CLIENT_ADMIN"), "CLIENT");
  });

  it("CLIENT_MEMBER → CLIENT", () => {
    assert.equal(viewForRole("CLIENT_MEMBER"), "CLIENT");
  });

  it("HR_MANAGER → HR", () => {
    assert.equal(viewForRole("HR_MANAGER"), "HR");
  });

  it("PEOPLE_OPS → HR", () => {
    assert.equal(viewForRole("PEOPLE_OPS"), "HR");
  });

  it("TEAM_LEAD → HR", () => {
    assert.equal(viewForRole("TEAM_LEAD"), "HR");
  });

  it("VA → VA", () => {
    assert.equal(viewForRole("VA"), "VA");
  });

  it("SENIOR_VA → VA", () => {
    assert.equal(viewForRole("SENIOR_VA"), "VA");
  });

  it("BOOKKEEPER → PAYROLL", () => {
    assert.equal(viewForRole("BOOKKEEPER"), "PAYROLL");
  });

  it("RECRUITER → RECRUITMENT", () => {
    assert.equal(viewForRole("RECRUITER"), "RECRUITMENT");
  });
});
