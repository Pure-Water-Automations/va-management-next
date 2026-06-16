import type { Role } from "@prisma/client";
import { env } from "@/lib/env";
import { openrouterChat, type ORResponse } from "@/lib/matrix/openrouter";
import { MATRIX_PROMPT } from "@/lib/matrix/context";
import { BYPASS_TOOLS, buildProposal, toolKind, runQuery, type Proposal } from "@/lib/purii-actions";
import { CODE_TOOLS, runCodeTool, isCodeTool } from "@/lib/matrix/code-access";
import { EDIT_RECORD_TOOL, buildRecordEdit } from "@/lib/matrix/record-editor";

export type MatrixResult =
  | { type: "answer"; text: string }
  | { type: "proposal"; proposal: Proposal }
  | { type: "error"; text: string };

const MATRIX_TOOLS = [...BYPASS_TOOLS, EDIT_RECORD_TOOL, ...CODE_TOOLS];
const MAX_STEPS = 8;
type ChatFn = (body: { messages: unknown[]; tools?: unknown[]; tool_choice?: unknown; temperature?: number; max_tokens?: number }) => Promise<ORResponse>;

function isWriteTool(name: string): boolean {
  return toolKind(name) === "action" || name === "edit_record";
}
async function runReadTool(name: string, args: Record<string, unknown>): Promise<string> {
  if (isCodeTool(name)) return runCodeTool(name, args);
  if (toolKind(name) === "query") return runQuery(name, args);
  return `Unknown read tool: ${name}`;
}

/** Bounded read-think-act loop. Reads auto-run; the first write returns a proposal for confirmation. */
export async function matrixAct(question: string, role: Role, actor: string, chat: ChatFn = openrouterChat): Promise<MatrixResult> {
  // Graceful degrade only for the real transport; injected chats (tests) bypass this.
  if (chat === openrouterChat && !env.OPENROUTER_API_KEY) {
    return { type: "error", text: "Matrix core offline — the OpenRouter key isn't wired up yet." };
  }
  const convo: any[] = [
    { role: "system", content: `${MATRIX_PROMPT}\n\n(Operator: admin ${actor}, role ${role.replace(/_/g, " ")}.)` },
    { role: "user", content: question.slice(0, 2000) },
  ];
  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const data = await chat({ messages: convo, tools: MATRIX_TOOLS, tool_choice: "auto", temperature: 0.2, max_tokens: 700 });
      const msg = data.choices?.[0]?.message;
      const calls = msg?.tool_calls ?? [];
      if (!calls.length) return { type: "answer", text: (msg?.content || "Standing by.").trim() };

      convo.push(msg);
      let writeCall: { id: string; name: string; args: Record<string, unknown> } | null = null;
      for (const call of calls) {
        const name = call.function?.name;
        const id = call.id ?? "";
        if (!name) { convo.push({ role: "tool", tool_call_id: id, content: "(no tool name)" }); continue; }
        let args: Record<string, unknown> = {};
        try { args = JSON.parse(call.function?.arguments || "{}"); } catch { args = {}; }
        if (isWriteTool(name)) {
          if (!writeCall) { writeCall = { id, name, args }; continue; } // defer the first write; respond below
          convo.push({ role: "tool", tool_call_id: id, content: "(skipped — one change at a time)" });
          continue;
        }
        const result = await runReadTool(name, args);
        convo.push({ role: "tool", tool_call_id: id, content: String(result).slice(0, 8000) });
      }

      if (writeCall) {
        const built = writeCall.name === "edit_record"
          ? await buildRecordEdit(writeCall.args)
          : await buildProposal(writeCall.name, writeCall.args);
        if ("error" in built) {
          convo.push({ role: "tool", tool_call_id: writeCall.id, content: built.error });
          continue; // let the model correct on the next step
        }
        convo.push({ role: "tool", tool_call_id: writeCall.id, content: "Proposed — awaiting the operator's confirmation." });
        return { type: "proposal", proposal: built };
      }
    }
    return { type: "answer", text: "I dug around a fair bit — tell me exactly how you'd like to proceed." };
  } catch {
    return { type: "error", text: "Couldn't reach my core just now — try again?" };
  }
}
