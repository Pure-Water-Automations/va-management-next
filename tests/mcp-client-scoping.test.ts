import test from "node:test";
import assert from "node:assert/strict";
import { filterProjectsByClientOrg, taskClientOrgWhere } from "../src/lib/mcp/scoping";
import { MCP_TOOLS } from "../src/lib/mcp/protocol";

test("filterProjectsByClientOrg: no filter returns everything unchanged", () => {
  const rows = [{ id: "a", clientOrganizationId: "c1" }, { id: "b", clientOrganizationId: null }];
  assert.deepEqual(filterProjectsByClientOrg(rows, undefined), rows);
});

test("filterProjectsByClientOrg: filters to an exact clientOrganizationId match", () => {
  const rows = [
    { id: "a", clientOrganizationId: "c1" },
    { id: "b", clientOrganizationId: "c2" },
    { id: "c", clientOrganizationId: null },
  ];
  assert.deepEqual(filterProjectsByClientOrg(rows, "c1").map((r) => r.id), ["a"]);
});

test("filterProjectsByClientOrg: a client with no matching rows returns empty, not everything", () => {
  const rows = [{ id: "a", clientOrganizationId: "c1" }];
  assert.deepEqual(filterProjectsByClientOrg(rows, "nonexistent-client"), []);
});

test("taskClientOrgWhere: no filter produces an empty where fragment", () => {
  assert.deepEqual(taskClientOrgWhere(undefined), {});
});

test("taskClientOrgWhere: a filter produces an exact clientOrganizationId where fragment", () => {
  assert.deepEqual(taskClientOrgWhere("c1"), { clientOrganizationId: "c1" });
});

test("list_projects and list_tasks tool schemas declare clientOrgId as an optional string filter", () => {
  const projects = MCP_TOOLS.find((t) => t.name === "list_projects");
  const tasks = MCP_TOOLS.find((t) => t.name === "list_tasks");
  assert.ok(projects, "list_projects tool must exist");
  assert.ok(tasks, "list_tasks tool must exist");
  const projectsProps = (projects!.inputSchema as { properties: Record<string, unknown> }).properties;
  const tasksProps = (tasks!.inputSchema as { properties: Record<string, unknown> }).properties;
  assert.ok(projectsProps.clientOrgId, "list_projects schema must declare clientOrgId");
  assert.ok(tasksProps.clientOrgId, "list_tasks schema must declare clientOrgId");
});

test("filterProjectsByClientOrg/taskClientOrgWhere: an empty string is a real filter, never treated as 'no filter'", () => {
  const rows = [{ id: "a", clientOrganizationId: "c1" }, { id: "b", clientOrganizationId: null }];
  assert.deepEqual(filterProjectsByClientOrg(rows, ""), []);
  assert.deepEqual(taskClientOrgWhere(""), { clientOrganizationId: "" });
});
