import test from "node:test";
import assert from "node:assert/strict";

import { enhanceResearch, parseFindings } from "../src/lib/secondbrain/agent";

function toolCallResp(name: string, args: unknown) {
  return {
    choices: [{ message: { tool_calls: [{ id: "c1", function: { name, arguments: JSON.stringify(args) } }] } }],
  };
}

test("parseFindings coerces tasks + sources and defaults priority", () => {
  const f = parseFindings({
    brief: "  the brief  ",
    tasks: [{ title: "A", priority: "High" }, { title: "B" }, { nope: 1 }, "junk"],
    sources: [{ title: "S1", link: "https://x" }, {}, { title: "" }],
  });
  assert.equal(f.kind, "findings");
  assert.equal(f.brief, "the brief");
  assert.equal(f.tasks.length, 2);
  assert.equal(f.tasks[0].priority, "High");
  assert.equal(f.tasks[1].priority, "Medium"); // default
  assert.equal(f.sources.length, 1);
  assert.equal(f.sources[0].title, "S1");
});

test("agent loop searches, then submits findings (with progress steps)", async () => {
  const searched: [string, string][] = [];
  let turn = 0;
  const chat = async () => {
    turn++;
    if (turn === 1) return toolCallResp("search_meetings", { query: "northeast assembly last wednesday purpose" });
    return toolCallResp("submit_findings", {
      brief: "The Assembly meets the last Wednesday of the month to unite the region.",
      tasks: [{ title: "Draft the agenda", priority: "High" }],
      sources: [{ title: "NE Special Projects", link: "https://x" }],
    });
  };
  const steps: string[] = [];
  const res = await enhanceResearch({
    project: { name: "Northeast Assembly", client: "HSA-UWC Northeast", description: "meet on zoom" },
    prompt: "tell me about these meetings",
    chat,
    searchFn: async (name, query) => {
      searched.push([name, query]);
      return "**[30:47] Naokimi:** the Regional Assembly main purpose is to celebrate victories...";
    },
    onStep: (l) => steps.push(l),
  });
  assert.equal(res.kind, "findings");
  if (res.kind !== "findings") return;
  assert.match(res.brief, /last Wednesday/);
  assert.equal(res.tasks.length, 1);
  assert.equal(res.sources[0].title, "NE Special Projects");
  assert.deepEqual(searched[0], ["search_meetings", "northeast assembly last wednesday purpose"]);
  assert.ok(steps.length >= 1 && /Searching meetings/.test(steps[0]));
});

test("agent asks clarifying questions when the project is vague and no guidance was given", async () => {
  const chat = async () =>
    toolCallResp("ask_clarifying_questions", { questions: ["Is this the monthly regional Assembly?", "Recurring or one-off?"] });
  const res = await enhanceResearch({
    project: { name: "Assembly", description: null },
    chat,
    searchFn: async () => "",
  });
  assert.equal(res.kind, "questions");
  if (res.kind !== "questions") return;
  assert.equal(res.questions.length, 2);
});

test("forces a conclusion when the model never volunteers submit_findings", async () => {
  // The model keeps searching; only when offered just submit_findings (finalize) does it conclude.
  const chat = async (body: { tools?: unknown[] }) => {
    const onlySubmit = Array.isArray(body.tools) && body.tools.length === 1;
    if (onlySubmit) return toolCallResp("submit_findings", { brief: "Concluded from what I gathered.", tasks: [], sources: [] });
    return toolCallResp("search_meetings", { query: "keeps searching" });
  };
  const res = await enhanceResearch({ project: { name: "X" }, prompt: "go", chat, searchFn: async () => "some data", maxSteps: 3 });
  assert.equal(res.kind, "findings");
  if (res.kind !== "findings") return;
  assert.match(res.brief, /Concluded/);
});

test("finalize falls back to a prose brief if even submit-only yields no submit call", async () => {
  const chat = async (body: { tools?: unknown[] }) => {
    const noTools = !body.tools || (Array.isArray(body.tools) && body.tools.length === 0);
    if (noTools) return { choices: [{ message: { content: "Honest prose brief: found little." } }] };
    // submit-only finalize call: model misbehaves and emits a (hallucinated) search instead
    if (Array.isArray(body.tools) && body.tools.length === 1) return toolCallResp("search_meetings", { query: "nope" });
    return toolCallResp("search_meetings", { query: "loop" });
  };
  const res = await enhanceResearch({ project: { name: "X" }, prompt: "go", chat, searchFn: async () => "x", maxSteps: 2 });
  assert.equal(res.kind, "findings");
  if (res.kind !== "findings") return;
  assert.match(res.brief, /Honest prose brief/);
});

test("a prose answer (no tool call) is wrapped as the brief", async () => {
  const chat = async () => ({ choices: [{ message: { content: "Here is what I found.", tool_calls: [] } }] });
  const res = await enhanceResearch({ project: { name: "X" }, prompt: "go", chat, searchFn: async () => "" });
  assert.equal(res.kind, "findings");
  if (res.kind !== "findings") return;
  assert.equal(res.brief, "Here is what I found.");
});
