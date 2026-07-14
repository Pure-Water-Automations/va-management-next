import test from "node:test";
import assert from "node:assert/strict";

import { handleMcpRequest, MCP_TOOLS } from "../src/lib/mcp/protocol";

const noopExec = async () => ({ text: "ok" });

test("initialize returns protocol version + serverInfo", async () => {
  const r = await handleMcpRequest({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05" } }, noopExec);
  assert.ok(r && "result" in r);
  const res = (r as { result: Record<string, unknown> }).result;
  assert.equal((res.serverInfo as Record<string, unknown>).name, "va-management");
  assert.ok((res.capabilities as Record<string, unknown>).tools);
});

test("tools/list returns the tool catalog", async () => {
  const r = await handleMcpRequest({ id: 2, method: "tools/list" }, noopExec);
  const tools = (r as { result: { tools: unknown[] } }).result.tools;
  assert.equal(tools.length, MCP_TOOLS.length);
  assert.ok(MCP_TOOLS.some((t) => t.name === "create_task"));
});

test("notifications get no response (null)", async () => {
  const r = await handleMcpRequest({ method: "notifications/initialized" }, noopExec);
  assert.equal(r, null);
});

test("tools/call runs the executor and wraps the result", async () => {
  const r = await handleMcpRequest(
    { id: 3, method: "tools/call", params: { name: "list_projects", arguments: {} } },
    async (name, args) => ({ text: `ran ${name} ${JSON.stringify(args)}` }),
  );
  const res = (r as { result: { content: { text: string }[]; isError: boolean } }).result;
  assert.match(res.content[0].text, /ran list_projects/);
  assert.equal(res.isError, false);
});

test("tools/call on an unknown tool errors", async () => {
  const r = await handleMcpRequest({ id: 4, method: "tools/call", params: { name: "nope", arguments: {} } }, noopExec);
  assert.ok(r && "error" in r);
});

test("a throwing executor surfaces as isError, not a transport failure", async () => {
  const r = await handleMcpRequest(
    { id: 5, method: "tools/call", params: { name: "create_task", arguments: {} } },
    async () => {
      throw new Error("boom");
    },
  );
  const res = (r as { result: { content: { text: string }[]; isError: boolean } }).result;
  assert.equal(res.isError, true);
  assert.match(res.content[0].text, /boom/);
});

test("unknown method returns method-not-found", async () => {
  const r = await handleMcpRequest({ id: 6, method: "frobnicate" }, noopExec);
  assert.equal((r as { error: { code: number } }).error.code, -32601);
});

// Delegation MCP security property: when a tool subset is passed, tools/list only
// advertises the subset and tools/call rejects any tool outside it — even ones that
// exist in the global catalog. Guards against a delegator invoking send_client_agreement.
test("a tool subset gates both tools/list and tools/call", async () => {
  const subset = MCP_TOOLS.filter((t) => ["create_task", "list_projects"].includes(t.name));

  const listed = await handleMcpRequest({ id: 7, method: "tools/list" }, noopExec, subset);
  const names = (listed as { result: { tools: { name: string }[] } }).result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), ["create_task", "list_projects"]);
  assert.ok(!names.includes("send_client_agreement"));

  // In-subset tool runs.
  const ok = await handleMcpRequest(
    { id: 8, method: "tools/call", params: { name: "create_task", arguments: {} } },
    async (name) => ({ text: `ran ${name}` }),
    subset,
  );
  assert.match((ok as { result: { content: { text: string }[] } }).result.content[0].text, /ran create_task/);

  // Out-of-subset tool (exists globally) is rejected as unknown, executor never runs.
  let executorRan = false;
  const blocked = await handleMcpRequest(
    { id: 9, method: "tools/call", params: { name: "send_client_agreement", arguments: {} } },
    async () => {
      executorRan = true;
      return { text: "should not run" };
    },
    subset,
  );
  assert.ok(blocked && "error" in blocked, "out-of-subset tool must error");
  assert.equal((blocked as { error: { code: number } }).error.code, -32602);
  assert.equal(executorRan, false, "executor must not run for a gated tool");
});
