import test from "node:test";
import assert from "node:assert/strict";

import { discoverProjects, parseProposals } from "../src/lib/secondbrain/discover";

function toolCallResp(name: string, args: unknown) {
  return { choices: [{ message: { tool_calls: [{ id: "c1", function: { name, arguments: JSON.stringify(args) } }] } }] };
}

test("parseProposals validates projects, defaults task priority, drops junk", () => {
  const res = parseProposals({
    projects: [
      { name: "  NE Website Refresh  ", description: "Rebuild the site", client: "Northeast", rationale: "Discussed in meeting", sourceQuote: "we need a new site", tasks: [{ title: "Audit site", priority: "High" }, { title: "Draft copy" }, { nope: 1 }] },
      { name: "", tasks: [] },
      "junk",
      { name: "Onboard Acme", tasks: [] },
    ],
  });
  assert.equal(res.kind, "proposals");
  if (res.kind !== "proposals") return;
  assert.equal(res.projects.length, 2); // empty-name + junk dropped
  assert.equal(res.projects[0].name, "NE Website Refresh");
  assert.equal(res.projects[0].tasks.length, 2);
  assert.equal(res.projects[0].tasks[0].priority, "High");
  assert.equal(res.projects[0].tasks[1].priority, "Medium"); // default
  assert.equal(res.projects[1].tasks.length, 0);
});

test("discover loop: scans then proposes via the propose model", async () => {
  const searched: string[] = [];
  let turn = 0;
  const chat = async (body: { tools?: unknown[] }) => {
    turn++;
    const proposeOnly = Array.isArray(body.tools) && body.tools.length === 1;
    if (proposeOnly) {
      return toolCallResp("propose_projects", {
        projects: [{ name: "OS rollout follow-up", description: "Track the new app rollout", rationale: "Aira said hyunjin joined", sourceQuote: "the project will be needing commitment", tasks: [{ title: "Add hyunjin to OS group", priority: "Medium" }] }],
      });
    }
    if (turn === 1) return toolCallResp("list_recent_meetings", {});
    return toolCallResp("search_whatsapp", { query: "project commitment" });
  };
  const steps: string[] = [];
  const res = await discoverProjects({
    existingProjectNames: ["Northeast Assembly"],
    windowLabel: "last 7 days",
    chat,
    searchFn: async (name) => {
      searched.push(name);
      return name === "list_recent_meetings" ? "2026-06-17 | PWA | OS Check-in" : '[{"sender_name":"Aira","content":"the project will be needing commitment"}]';
    },
    onStep: (l) => steps.push(l),
    maxSteps: 5,
  });
  assert.equal(res.kind, "proposals");
  if (res.kind !== "proposals") return;
  assert.equal(res.projects.length, 1);
  assert.equal(res.projects[0].name, "OS rollout follow-up");
  assert.ok(searched.includes("list_recent_meetings"));
  assert.ok(steps.some((s) => /Listing recent meetings/.test(s)));
});

test("discover returns empty proposals (not error) when the model proposes nothing", async () => {
  const chat = async (body: { tools?: unknown[] }) => {
    const proposeOnly = Array.isArray(body.tools) && body.tools.length === 1;
    if (proposeOnly) return toolCallResp("propose_projects", { projects: [] });
    return toolCallResp("search_whatsapp", { query: "x" });
  };
  const res = await discoverProjects({ existingProjectNames: [], windowLabel: "last 7 days", chat, searchFn: async () => "nothing relevant", maxSteps: 3 });
  assert.equal(res.kind, "proposals");
  if (res.kind !== "proposals") return;
  assert.equal(res.projects.length, 0);
});
