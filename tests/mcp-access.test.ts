import test from "node:test";
import assert from "node:assert/strict";
import type { Role } from "@prisma/client";

import { actorAllows, visibleTools, isMcpEligibleRole } from "../src/lib/mcp/access";
import { MCP_TOOLS, handleMcpRequest } from "../src/lib/mcp/protocol";

const actor = (actorRole: Role, isAdmin = false) => ({ actorRole, isAdmin });

const namesFor = (role: Role, isAdmin = false) => visibleTools(MCP_TOOLS, actor(role, isAdmin)).map((t) => t.name);

test("every tool declares a known access group", () => {
  const groups = new Set(["staff", "delegator", "hr", "payroll", "recruitment", "sales"]);
  for (const t of MCP_TOOLS) assert.ok(groups.has(t.access), `${t.name} has bad access "${t.access}"`);
});

test("VA sees self-service tools but no management/HR/payroll/recruitment/sales tools", () => {
  const names = namesFor("VA");
  for (const expected of ["whoami", "my_tasks", "get_task", "update_task_status", "add_task_comment", "list_available_tasks", "claim_task", "my_notifications", "list_projects", "create_task"]) {
    assert.ok(names.includes(expected), `VA should see ${expected}`);
  }
  for (const hidden of ["list_assignees", "reassign_task", "resolve_claim", "create_project", "list_tasks", "team_overview", "get_va_profile", "payroll_summary", "recruitment_pipeline", "list_deals", "create_deal", "send_client_agreement", "convert_deal_to_client"]) {
    assert.ok(!names.includes(hidden), `VA should NOT see ${hidden}`);
  }
});

test("SENIOR_VA gains the delegator tools but not HR/payroll/recruitment/sales", () => {
  const names = namesFor("SENIOR_VA");
  for (const expected of ["list_assignees", "reassign_task", "resolve_claim", "create_project", "list_tasks"]) {
    assert.ok(names.includes(expected), `SENIOR_VA should see ${expected}`);
  }
  for (const hidden of ["team_overview", "payroll_summary", "recruitment_pipeline", "list_deals"]) {
    assert.ok(!names.includes(hidden), `SENIOR_VA should NOT see ${hidden}`);
  }
});

test("TEAM_LEAD sees delegation + HR + recruitment, but not payroll or sales", () => {
  const names = namesFor("TEAM_LEAD");
  for (const expected of ["list_assignees", "team_overview", "get_va_profile", "recruitment_pipeline"]) {
    assert.ok(names.includes(expected), `TEAM_LEAD should see ${expected}`);
  }
  for (const hidden of ["payroll_summary", "list_deals", "create_deal"]) {
    assert.ok(!names.includes(hidden), `TEAM_LEAD should NOT see ${hidden}`);
  }
});

test("HR_MANAGER sees everything except nothing (all groups)", () => {
  const names = namesFor("HR_MANAGER");
  for (const expected of ["team_overview", "payroll_summary", "recruitment_pipeline", "list_deals", "list_assignees"]) {
    assert.ok(names.includes(expected), `HR_MANAGER should see ${expected}`);
  }
});

test("BOOKKEEPER sees payroll + staff tools only", () => {
  const names = namesFor("BOOKKEEPER");
  assert.ok(names.includes("payroll_summary"));
  assert.ok(names.includes("my_tasks"));
  for (const hidden of ["list_assignees", "team_overview", "recruitment_pipeline", "list_deals"]) {
    assert.ok(!names.includes(hidden), `BOOKKEEPER should NOT see ${hidden}`);
  }
});

test("RECRUITER sees recruitment + staff tools only", () => {
  const names = namesFor("RECRUITER");
  assert.ok(names.includes("recruitment_pipeline"));
  for (const hidden of ["payroll_summary", "list_deals", "list_assignees", "team_overview"]) {
    assert.ok(!names.includes(hidden), `RECRUITER should NOT see ${hidden}`);
  }
});

test("SALES sees deals + staff tools only", () => {
  const names = namesFor("SALES");
  for (const expected of ["list_deals", "create_deal", "send_client_agreement", "convert_deal_to_client"]) {
    assert.ok(names.includes(expected), `SALES should see ${expected}`);
  }
  for (const hidden of ["payroll_summary", "team_overview", "recruitment_pipeline", "list_assignees"]) {
    assert.ok(!names.includes(hidden), `SALES should NOT see ${hidden}`);
  }
});

test("admins see the full catalog regardless of role", () => {
  assert.equal(namesFor("VA", true).length, MCP_TOOLS.length);
  assert.equal(namesFor("BOOKKEEPER", true).length, MCP_TOOLS.length);
});

test("client-portal roles are ineligible for everything", () => {
  assert.equal(isMcpEligibleRole("CLIENT_ADMIN" as Role), false);
  assert.equal(isMcpEligibleRole("CLIENT_MEMBER" as Role), false);
  assert.equal(actorAllows(actor("CLIENT_ADMIN" as Role, true), "staff"), false);
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
