import test from "node:test";
import assert from "node:assert/strict";
import { canApproveRow } from "../src/lib/auth/payroll-approval";

test("admin, HR, People Ops, and bookkeeper approve anyone", () => {
  assert.equal(canApproveRow({ isAdmin: true, role: "BOOKKEEPER", vaId: null }, "va9"), true);
  assert.equal(canApproveRow({ isAdmin: false, role: "HR_MANAGER", vaId: null }, "va9"), true);
  assert.equal(canApproveRow({ isAdmin: false, role: "PEOPLE_OPS", vaId: null }, "va9"), true);
  assert.equal(canApproveRow({ isAdmin: false, role: "BOOKKEEPER", vaId: null }, "va9"), true);
});

test("non-privileged staff do not approve without a supervisor match", () => {
  assert.equal(canApproveRow({ isAdmin: false, role: "TEAM_LEAD", vaId: null }, "va9"), false);
  assert.equal(canApproveRow({ isAdmin: false, role: "SENIOR_VA", vaId: "senior1" }, null), false);
});

test("a supervisor approves only their own reports", () => {
  const sup = { isAdmin: false, role: "VA" as const, vaId: "sup1" };
  assert.equal(canApproveRow(sup, "sup1"), true, "supervisorVaId matches");
  assert.equal(canApproveRow(sup, "other"), false);
});
