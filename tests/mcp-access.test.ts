import test from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@prisma/client";

import { actorAllows, visibleTools, isMcpEligibleRole, isAllAccess } from "../src/lib/mcp/access";
import { MCP_TOOLS, handleMcpRequest } from "../src/lib/mcp/protocol";

const actor = (actorRole: Role, opts: { isAdmin?: boolean; canDelegate?: boolean } = {}) => ({
  actorRole,
  isAdmin: opts.isAdmin ?? false,
  canDelegate: opts.canDelegate ?? false,
});

const namesFor = (role: Role, opts: { isAdmin?: boolean; canDelegate?: boolean } = {}) =>
  visibleTools(MCP_TOOLS, actor(role, opts)).map((t) => t.name);

const STAFF_TOOLS = ["whoami", "my_tasks", "get_task", "update_task_status", "add_task_comment", "list_available_tasks", "claim_task", "my_notifications", "list_projects", "create_task"];
const DELEGATOR_TOOLS = ["list_tasks", "list_assignees", "reassign_task", "resolve_claim", "create_project"];
const HR_TOOLS = ["team_overview", "get_va_profile"];
const SALES_TOOLS = ["list_deals", "create_deal", "send_client_agreement", "convert_deal_to_client"];

test("every tool declares a known access group", () => {
  const groups = new Set(["staff", "delegator", "hr", "payroll", "recruitment", "sales"]);
  for (const t of MCP_TOOLS) assert.ok(groups.has(t.access), `${t.name} has bad access "${t.access}"`);
});

test("plain VA (no delegation tier) sees only the self-service staff tools", () => {
  const names = namesFor("VA");
  for (const expected of STAFF_TOOLS) assert.ok(names.includes(expected), `VA should see ${expected}`);
  assert.equal(names.length, STAFF_TOOLS.length);
});

test("a VA whose tier grants delegation gains the delegator tools (tier-driven, not role-driven)", () => {
  const names = namesFor("VA", { canDelegate: true });
  for (const expected of DELEGATOR_TOOLS) assert.ok(names.includes(expected), `delegating VA should see ${expected}`);
  for (const hidden of [...HR_TOOLS, "payroll_summary", "recruitment_pipeline", ...SALES_TOOLS]) {
    assert.ok(!names.includes(hidden), `delegating VA should NOT see ${hidden}`);
  }
});

test("legacy SENIOR_VA/TEAM_LEAD rows get no delegator tools by role alone", () => {
  for (const legacy of ["SENIOR_VA", "TEAM_LEAD"] as Role[]) {
    const names = namesFor(legacy);
    for (const hidden of DELEGATOR_TOOLS) assert.ok(!names.includes(hidden), `${legacy} should NOT see ${hidden} without the tier flag`);
  }
});

test("HR_MANAGER sees HR + payroll + recruitment + sales, delegation only via the tier/admin flag", () => {
  const names = namesFor("HR_MANAGER");
  for (const expected of [...HR_TOOLS, "payroll_summary", "recruitment_pipeline", ...SALES_TOOLS]) {
    assert.ok(names.includes(expected), `HR_MANAGER should see ${expected}`);
  }
  for (const hidden of DELEGATOR_TOOLS) assert.ok(!names.includes(hidden), `HR_MANAGER should NOT see ${hidden} (HR was de-bloated out of delegation)`);
});

test("PEOPLE_OPS sees HR + recruitment + sales but not payroll", () => {
  const names = namesFor("PEOPLE_OPS");
  for (const expected of [...HR_TOOLS, "recruitment_pipeline", ...SALES_TOOLS]) assert.ok(names.includes(expected), `PEOPLE_OPS should see ${expected}`);
  assert.ok(!names.includes("payroll_summary"));
});

test("BOOKKEEPER sees payroll + staff tools only", () => {
  const names = namesFor("BOOKKEEPER");
  assert.ok(names.includes("payroll_summary"));
  assert.ok(names.includes("my_tasks"));
  for (const hidden of [...DELEGATOR_TOOLS, ...HR_TOOLS, "recruitment_pipeline", ...SALES_TOOLS]) {
    assert.ok(!names.includes(hidden), `BOOKKEEPER should NOT see ${hidden}`);
  }
});

test("RECRUITER sees recruitment + staff tools only", () => {
  const names = namesFor("RECRUITER");
  assert.ok(names.includes("recruitment_pipeline"));
  for (const hidden of ["payroll_summary", ...SALES_TOOLS, ...DELEGATOR_TOOLS, ...HR_TOOLS]) {
    assert.ok(!names.includes(hidden), `RECRUITER should NOT see ${hidden}`);
  }
});

test("SALES sees deals + staff tools only", () => {
  const names = namesFor("SALES");
  for (const expected of SALES_TOOLS) assert.ok(names.includes(expected), `SALES should see ${expected}`);
  for (const hidden of ["payroll_summary", "recruitment_pipeline", ...DELEGATOR_TOOLS, ...HR_TOOLS]) {
    assert.ok(!names.includes(hidden), `SALES should NOT see ${hidden}`);
  }
});

test("all-access users (isAdmin or TESTER) see the full catalog", () => {
  assert.equal(namesFor("VA", { isAdmin: true }).length, MCP_TOOLS.length);
  assert.equal(namesFor("BOOKKEEPER", { isAdmin: true }).length, MCP_TOOLS.length);
  assert.equal(namesFor("TESTER" as Role).length, MCP_TOOLS.length);
  assert.ok(isAllAccess({ actorRole: "TESTER" as Role, isAdmin: false }));
});

test("client-portal roles are ineligible for everything", () => {
  assert.equal(isMcpEligibleRole("CLIENT_ADMIN" as Role), false);
  assert.equal(isMcpEligibleRole("CLIENT_MEMBER" as Role), false);
  assert.equal(actorAllows(actor("CLIENT_ADMIN" as Role, { isAdmin: true }), "staff"), false);
  assert.equal(namesFor("CLIENT_MEMBER" as Role).length, 0);
});

test("tools/list only returns the caller's visible tools, without the access tag", async () => {
  const vaTools = visibleTools(MCP_TOOLS, actor("VA"));
  const r = await handleMcpRequest({ id: 1, method: "tools/list" }, async () => ({ text: "ok" }), vaTools);
  const tools = (r as { result: { tools: Record<string, unknown>[] } }).result.tools;
  assert.equal(tools.length, vaTools.length);
  assert.ok(tools.every((t) => !("access" in t)));
});

test("tools/call on a tool outside the caller's catalog is rejected with a role message", async () => {
  const vaTools = visibleTools(MCP_TOOLS, actor("VA"));
  const r = await handleMcpRequest(
    { id: 2, method: "tools/call", params: { name: "payroll_summary", arguments: {} } },
    async () => ({ text: "should not run" }),
    vaTools,
  );
  assert.ok(r && "error" in r);
  assert.match((r as { error: { message: string } }).error.message, /not available to your role/);
});

test("tools/call on a truly unknown tool says unknown", async () => {
  const r = await handleMcpRequest({ id: 3, method: "tools/call", params: { name: "nope", arguments: {} } }, async () => ({ text: "x" }), MCP_TOOLS);
  assert.match((r as { error: { message: string } }).error.message, /Unknown tool/);
});
