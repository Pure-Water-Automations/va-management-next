import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAgreement, agreementVarsForDeal } from "../src/lib/sales/client-template";

test("renderAgreement substitutes known tokens and blanks unknown ones", () => {
  const html = renderAgreement(
    "<p>{{client}} buys {{package}} for {{price}}. {{bogus}}</p>",
    { client: "Grace Church", contact: "Pat", package: "Stream", price: "$1,200/mo", billing: "retainer", start_date: "2026-07-01", date: "2026-06-20", deadline: "2026-07-04", company: "PWA" },
  );
  assert.equal(html, "<p>Grace Church buys Stream for $1,200/mo. </p>");
});

test("agreementVarsForDeal prefers agreement fields, falls back to deal + settings", () => {
  const now = new Date("2026-06-20T00:00:00Z");
  const vars = agreementVarsForDeal(
    { orgName: "Grace Church", contactName: "Pat Lee", packageName: "Stream", billingType: "retainer", startDate: new Date("2026-07-01T00:00:00Z") },
    { packageName: null, priceLabel: "$1,200/mo, billed in advance", billingType: null, deadline: new Date("2026-07-04T00:00:00Z") },
    new Map([["company_name", "Pure Water Automations"]]),
    now,
  );
  assert.equal(vars.client, "Grace Church");
  assert.equal(vars.contact, "Pat Lee");
  assert.equal(vars.package, "Stream"); // fell back to deal.packageName
  assert.equal(vars.price, "$1,200/mo, billed in advance");
  assert.equal(vars.billing, "retainer"); // fell back to deal.billingType
  assert.equal(vars.start_date, "2026-07-01");
  assert.equal(vars.deadline, "2026-07-04");
  assert.equal(vars.date, "2026-06-20");
  assert.equal(vars.company, "Pure Water Automations");
});

test("agreementVarsForDeal uses sensible defaults when fields are empty", () => {
  const vars = agreementVarsForDeal(
    { orgName: "", contactName: null, packageName: null, billingType: null, startDate: null },
    { packageName: null, priceLabel: null, billingType: null, deadline: null },
    new Map(),
    new Date("2026-06-20T00:00:00Z"),
  );
  assert.equal(vars.client, "Client");
  assert.equal(vars.contact, "");
  assert.equal(vars.company, "Pure Water Automations");
  assert.equal(vars.start_date, "");
});
