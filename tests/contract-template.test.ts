import { test } from "node:test";
import assert from "node:assert/strict";
import { renderContract, type ContractVars } from "../src/lib/contract/template";

const vars: ContractVars = {
  name: "Ana Cruz", role: "Virtual Assistant", rate: "$6.00/hr",
  date: "2026-06-15", deadline: "2026-06-22", company: "Pure Water Automations",
};

test("renderContract substitutes all known tokens", () => {
  const out = renderContract("<p>{{name}} joins {{company}} as a {{role}} at {{rate}}.</p>", vars);
  assert.equal(out, "<p>Ana Cruz joins Pure Water Automations as a Virtual Assistant at $6.00/hr.</p>");
});

test("renderContract blanks unknown tokens", () => {
  assert.equal(renderContract("<p>{{name}} {{unknown}}</p>", vars), "<p>Ana Cruz </p>");
});
