import test from "node:test";
import assert from "node:assert/strict";

import { salesAccessFor } from "../src/lib/auth/sales-guard";

const u = (role: string, isAdmin = false) => ({ role: role as never, isAdmin });

test("client-portal logins are sent to the portal", () => {
  assert.equal(salesAccessFor(u("CLIENT_ADMIN")), "client");
});

test("sales reps and all-access users are allowed", () => {
  assert.equal(salesAccessFor(u("SALES")), "ok");
  assert.equal(salesAccessFor(u("HR_MANAGER")), "ok"); // HR works the pipeline (isSalesRep)
  assert.equal(salesAccessFor(u("VA", true)), "ok"); // platform admin
  assert.equal(salesAccessFor(u("TESTER")), "ok"); // QA role — the old redirect-loop regression
});

test("other staff are bounced home unless the deployment is a sales console", () => {
  assert.equal(salesAccessFor(u("VA")), "home");
  assert.equal(salesAccessFor(u("RECRUITER")), "home");
  assert.equal(salesAccessFor(u("BOOKKEEPER")), "home");
  process.env.CONSOLE_MODE = "sales";
  try {
    assert.equal(salesAccessFor(u("VA")), "ok"); // whole instance IS the sales console
    assert.equal(salesAccessFor(u("CLIENT_ADMIN")), "client"); // clients still stay in the portal
  } finally {
    delete process.env.CONSOLE_MODE;
  }
});
