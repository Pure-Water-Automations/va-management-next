// Minimal, dependency-free MCP (Model Context Protocol) JSON-RPC handler for the
// Streamable-HTTP transport. Tool execution is injected so this stays pure + testable.
// Verified against the official @modelcontextprotocol/sdk client (same client family
// Claude / ChatGPT use).

export const MCP_PROTOCOL_VERSION = "2024-11-05";

export type McpTool = { name: string; description: string; inputSchema: Record<string, unknown> };

const priorityEnum = { type: "string", enum: ["Low", "Medium", "High"] };

export const MCP_TOOLS: McpTool[] = [
  {
    name: "list_projects",
    description: "List the team's projects (name, status, client, owner, open/total task counts). Call before creating to avoid duplicates.",
    inputSchema: { type: "object", properties: { status: { type: "string", description: "Optional filter: Planning | Active | OnHold | Done" } } },
  },
  {
    name: "create_project",
    description: "Create a new project.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        description: { type: "string" },
        client: { type: "string" },
        priority: priorityEnum,
        dueDate: { type: "string", description: "ISO date, e.g. 2026-07-15" },
      },
      required: ["name"],
    },
  },
  {
    name: "list_tasks",
    description: "List tasks, optionally for one project. Returns title, status, assignee, priority, due date.",
    inputSchema: { type: "object", properties: { project: { type: "string", description: "Project id or name" }, status: { type: "string" } } },
  },
  {
    name: "create_task",
    description: "Create and assign a task. Assigning to a VA sends them the normal assignment email. If no assignee is given it is assigned to the MCP service user.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        project: { type: "string", description: "Project id or name to attach the task to (optional)" },
        assignee: { type: "string", description: "Assignee email or name (use list_assignees to choose). Optional." },
        priority: priorityEnum,
        dueDate: { type: "string", description: "ISO date" },
        instructions: { type: "string" },
      },
      required: ["title"],
    },
  },
  {
    name: "list_assignees",
    description: "List VAs you can assign to, each annotated with current workload (open task count), recent tasks they've worked on, clients they've worked with, and — if you pass a client — whether they've worked with that client. Use this to suggest the best-fit VA.",
    inputSchema: { type: "object", properties: { client: { type: "string", description: "Optional client name to flag prior experience with" } } },
  },
  {
    name: "update_task_status",
    description: "Update a task's status.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, status: { type: "string", enum: ["NotStarted", "InProgress", "Done", "Blocked"] } },
      required: ["taskId", "status"],
    },
  },
];

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<{ text: string; isError?: boolean }>;

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
export type RpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } } | null;

/**
 * Handle one MCP JSON-RPC message. Returns the response object, or null for
 * notifications (which get an empty 202). `exec` runs a tool call.
 */
export async function handleMcpRequest(body: unknown, exec: ToolExecutor): Promise<RpcResponse> {
  const req = (body ?? {}) as RpcRequest;
  const id = req.id ?? null;
  const method = req.method ?? "";

  // Notifications have no id and expect no response.
  if (method.startsWith("notifications/")) return null;

  const ok = (result: unknown): RpcResponse => ({ jsonrpc: "2.0", id, result });
  const err = (code: number, message: string): RpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

  switch (method) {
    case "initialize":
      return ok({
        protocolVersion: typeof req.params?.protocolVersion === "string" ? req.params.protocolVersion : MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "va-management", version: "1.0.0" },
      });
    case "ping":
      return ok({});
    case "tools/list":
      return ok({ tools: MCP_TOOLS });
    case "tools/call": {
      const name = typeof req.params?.name === "string" ? req.params.name : "";
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      if (!MCP_TOOLS.some((t) => t.name === name)) return err(-32602, `Unknown tool: ${name}`);
      try {
        const r = await exec(name, args);
        return ok({ content: [{ type: "text", text: r.text }], isError: !!r.isError });
      } catch (e) {
        return ok({ content: [{ type: "text", text: e instanceof Error ? e.message : "Tool failed" }], isError: true });
      }
    }
    default:
      return err(-32601, `Method not found: ${method}`);
  }
}
