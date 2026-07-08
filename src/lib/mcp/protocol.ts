// Minimal, dependency-free MCP (Model Context Protocol) JSON-RPC handler for the
// Streamable-HTTP transport. Tool execution is injected so this stays pure + testable.
// Verified against the official @modelcontextprotocol/sdk client (same client family
// Claude / ChatGPT use).

import type { McpAccessGroup } from "./access";

export const MCP_PROTOCOL_VERSION = "2024-11-05";

export type McpTool = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Role gate — see src/lib/mcp/access.ts. Tools outside the caller's groups are hidden AND uncallable. */
  access: McpAccessGroup;
};

const priorityEnum = { type: "string", enum: ["Low", "Medium", "High"] };
const statusEnum = { type: "string", enum: ["NotStarted", "InProgress", "Done", "Blocked"] };

export const MCP_TOOLS: McpTool[] = [
  // ── Everyone (any staff login, VAs included) ─────────────────────────────
  {
    name: "whoami",
    description: "Who am I connected as? Returns your name, role, console view, and the tools your role can use. Call this first if unsure what you're allowed to do.",
    inputSchema: { type: "object", properties: {} },
    access: "staff",
  },
  {
    name: "my_tasks",
    description: "List the tasks assigned to YOU (the connected user), ordered by urgency. Optionally filter by status.",
    inputSchema: { type: "object", properties: { status: statusEnum } },
    access: "staff",
  },
  {
    name: "get_task",
    description: "Full detail for one task: instructions, status, assignee, checklist, dependencies, and the comment thread.",
    inputSchema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
    access: "staff",
  },
  {
    name: "update_task_status",
    description: "Update a task's status. VAs can update their own tasks; managers can update any.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, status: statusEnum },
      required: ["taskId", "status"],
    },
    access: "staff",
  },
  {
    name: "add_task_comment",
    description: "Post a comment on a task (visible in the console's comment thread; @mentions notify people).",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, body: { type: "string" } },
      required: ["taskId", "body"],
    },
    access: "staff",
  },
  {
    name: "list_available_tasks",
    description: "List open-pool tasks anyone can claim (the console's Available list), including who has a pending claim.",
    inputSchema: { type: "object", properties: {} },
    access: "staff",
  },
  {
    name: "claim_task",
    description: "Request to claim an open-pool task for yourself. A manager approves or denies the claim.",
    inputSchema: { type: "object", properties: { taskId: { type: "string" } }, required: ["taskId"] },
    access: "staff",
  },
  {
    name: "my_notifications",
    description: "Your in-console notifications (task assignments, mentions, etc.). Defaults to unread only.",
    inputSchema: {
      type: "object",
      properties: { unreadOnly: { type: "boolean", description: "Default true" }, limit: { type: "number", description: "Max rows, default 20" } },
    },
    access: "staff",
  },
  {
    name: "list_projects",
    description: "List the team's projects (name, status, client, owner, open/total task counts). Call before creating to avoid duplicates.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", description: "Optional filter: Planning | Active | OnHold | Done" },
        clientOrgId: { type: "string", description: "Optional filter: only projects belonging to this ClientOrganization id" },
      },
    },
    access: "staff",
  },
  {
    name: "create_task",
    description: "Create a task. Managers can assign to any VA (sends the normal assignment email). VAs can only add tasks for themselves, and only onto a project (Tier 1+). If no assignee is given the task is assigned to you.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        project: { type: "string", description: "Project id or name to attach the task to (optional)" },
        assignee: { type: "string", description: "Assignee email or name (use list_assignees to choose). Optional; managers only." },
        priority: priorityEnum,
        dueDate: { type: "string", description: "ISO date" },
        instructions: { type: "string" },
      },
      required: ["title"],
    },
    access: "staff",
  },

  // ── Task delegators (HR Manager, People Ops, Team Lead, Senior VA) ──────
  {
    name: "list_tasks",
    description: "List tasks across the whole team, optionally for one project / status / assignee / client org. Returns title, status, assignee, priority, due date.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project id or name" },
        status: statusEnum,
        assignee: { type: "string", description: "Optional: only tasks assigned to this person (email or name)" },
        clientOrgId: { type: "string", description: "Optional filter: only tasks belonging to this ClientOrganization id" },
      },
    },
    access: "delegator",
  },
  {
    name: "list_assignees",
    description: "List VAs you can assign to, each annotated with current workload (open task count), recent tasks they've worked on, clients they've worked with, and — if you pass a client — whether they've worked with that client. Use this to suggest the best-fit VA.",
    inputSchema: { type: "object", properties: { client: { type: "string", description: "Optional client name to flag prior experience with" } } },
    access: "delegator",
  },
  {
    name: "reassign_task",
    description: "Reassign a task to a different VA (notifies the new assignee).",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, assignee: { type: "string", description: "New assignee email or name" } },
      required: ["taskId", "assignee"],
    },
    access: "delegator",
  },
  {
    name: "resolve_claim",
    description: "Approve or deny a VA's pending claim on an open-pool task.",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" }, approve: { type: "boolean" } },
      required: ["taskId", "approve"],
    },
    access: "delegator",
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
    access: "delegator",
  },

  // ── HR (HR Manager, People Ops, Team Lead) ───────────────────────────────
  {
    name: "team_overview",
    description: "HR overview of the VA team: every active/training VA with tier, status, weekly hours target, supervisor, and current open-task load.",
    inputSchema: { type: "object", properties: { includeDeparted: { type: "boolean", description: "Default false" } } },
    access: "hr",
  },
  {
    name: "get_va_profile",
    description: "One VA's full profile: tier, status, skills, availability, supervisor, contact channels, plus their open and recent tasks.",
    inputSchema: { type: "object", properties: { va: { type: "string", description: "VA name or email" } }, required: ["va"] },
    access: "hr",
  },

  // ── Payroll (Bookkeeper, HR Manager) ─────────────────────────────────────
  {
    name: "payroll_summary",
    description: "The open payroll period: per-VA hours, rate, and gross pay, plus period totals and recent closed periods.",
    inputSchema: { type: "object", properties: {} },
    access: "payroll",
  },

  // ── Recruitment (Recruiter, HR Manager, People Ops, Team Lead) ───────────
  {
    name: "recruitment_pipeline",
    description: "The recruitment pipeline: candidate counts per stage and each open candidate's stage, scores, and recruiter recommendation.",
    inputSchema: { type: "object", properties: { includeClosed: { type: "boolean", description: "Default false" } } },
    access: "recruitment",
  },

  // ── Sales (Sales, HR Manager, People Ops) ────────────────────────────────
  {
    name: "list_deals",
    description: "List client sales deals (org, stage, package, value, and agreement sent/signed/paid state). Optionally filter by stage.",
    inputSchema: { type: "object", properties: { stage: { type: "string", description: "Optional DealStage filter, e.g. verbal_yes | won" } } },
    access: "sales",
  },
  {
    name: "create_deal",
    description: "Create a client sales deal (bring a Notion-pipeline deal into the app to close it). Defaults stage to verbal_yes.",
    inputSchema: {
      type: "object",
      properties: {
        orgName: { type: "string" },
        contactName: { type: "string" },
        contactEmail: { type: "string" },
        packageName: { type: "string" },
        dealValue: { type: "number", description: "USD" },
        billingType: { type: "string", enum: ["retainer", "hourly", "project"] },
        startDate: { type: "string", description: "ISO date" },
        stage: { type: "string" },
        notionPageId: { type: "string", description: "Notion Pipeline page URL or id" },
      },
      required: ["orgName"],
    },
    access: "sales",
  },
  {
    name: "send_client_agreement",
    description: "Email the client contact a link to sign the service agreement in-app (the e-signer). Requires the deal to have a contact email.",
    inputSchema: { type: "object", properties: { dealId: { type: "string" } }, required: ["dealId"] },
    access: "sales",
  },
  {
    name: "convert_deal_to_client",
    description: "Promote a signed & paid deal to a client: create the portal organization + onboarding record and set the deal Won. Idempotent.",
    inputSchema: { type: "object", properties: { dealId: { type: "string" } }, required: ["dealId"] },
    access: "sales",
  },
];

export type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<{ text: string; isError?: boolean }>;

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
export type RpcResponse = { jsonrpc: "2.0"; id: string | number | null; result?: unknown; error?: { code: number; message: string } } | null;

/**
 * Handle one MCP JSON-RPC message. Returns the response object, or null for
 * notifications (which get an empty 202). `exec` runs a tool call. `tools` is
 * the caller-visible catalog (already role-filtered) — a tool outside it is
 * both hidden from tools/list and rejected on tools/call.
 */
export async function handleMcpRequest(body: unknown, exec: ToolExecutor, tools: McpTool[] = MCP_TOOLS): Promise<RpcResponse> {
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
        serverInfo: { name: "va-management", version: "2.0.0" },
      });
    case "ping":
      return ok({});
    case "tools/list":
      // Strip the internal access tag — clients only need the MCP tool shape.
      return ok({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
    case "tools/call": {
      const name = typeof req.params?.name === "string" ? req.params.name : "";
      const args = (req.params?.arguments ?? {}) as Record<string, unknown>;
      if (!tools.some((t) => t.name === name)) {
        const exists = MCP_TOOLS.some((t) => t.name === name);
        return err(-32602, exists ? `Tool "${name}" is not available to your role.` : `Unknown tool: ${name}`);
      }
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
