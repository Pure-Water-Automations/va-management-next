import test from "node:test";
import assert from "node:assert/strict";

import { chatJson, resetTrialAiRateLimits, type TrialAiTransport } from "../src/lib/trial/ai/client";
import { evaluateSimSubmission } from "../src/lib/trial/ai/evaluate";
import { outputFilter } from "../src/lib/trial/ai/guardrails";
import { generateActorReply } from "../src/lib/trial/ai/reply";

function response(content: string) {
  return { choices: [{ message: { content } }] };
}

test("sickness messages escalate to a human without calling AI", async () => {
  let calls = 0;
  const transport: TrialAiTransport = async () => {
    calls += 1;
    return response('{"reply":"AI should not answer this"}');
  };
  const result = await generateActorReply({
    trial: { id: "trial-sick", candidateName: "Ana" },
    actorType: "Purii",
    candidateText: "I am sick and need to see a doctor today.",
    history: [],
    transport,
  });

  assert.equal(result.escalated, true);
  assert.equal(result.escalationReason, "health_or_emergency");
  assert.equal(result.reply, null);
  assert.equal(calls, 0);
});

test("prohibited pass language is replaced with a neutral human-review redirect", async () => {
  assert.doesNotMatch(outputFilter("Great news: you passed! Keep going."), /you passed/i);

  const result = await generateActorReply({
    trial: { id: "trial-filter", candidateName: "Ana" },
    actorType: "Purii",
    candidateText: "How did I do?",
    history: [],
    transport: async () => response('{"reply":"You passed! Your draft is ready for review."}'),
  });

  assert.equal(result.escalated, false);
  assert.match(result.reply || "", /^\[Purii · AI coordinator\]/);
  assert.doesNotMatch(result.reply || "", /you passed/i);
  assert.match(result.reply || "", /human reviewer/i);
  assert.match(result.reply || "", /draft is ready for review/i);
});

test("Sarah proposes revision when August 12 is published as final without resolving the conflict", async () => {
  let prompt = "";
  const proposal = await evaluateSimSubmission({
    trial: { id: "trial-sim", candidateName: "Ana", currentDay: 2 },
    mission: { id: "mission-sim", status: "SUBMITTED" },
    template: {
      key: "sim",
      kind: "sim",
      contentJson: {
        clientBrief: "Kickoff notes say August 12; flyer says August 21; registration link missing.",
        hiddenTargets: ["identify conflict", "request registration link", "use date TBC"],
      },
    },
    submission: {
      submittedText1: "Please send the registration link.",
      submittedText2: "Community Impact Day is Saturday, August 12.",
    },
    transport: async (body) => {
      prompt = JSON.stringify(body.messages);
      return response(
        JSON.stringify({
          approved: false,
          feedback: {
            obs: "The draft publishes August 12 as final without identifying the August 21 conflict.",
            impact: "Families could receive an unconfirmed event date.",
            sugg: "Mark the date TBC and ask the client to confirm August 12 versus August 21.",
            enc: "Revision is a normal part of making this client-ready.",
          },
        }),
      );
    },
  });

  assert.equal(proposal?.approved, false);
  assert.equal(proposal ? !proposal.approved : false, true, "needsRevision is the inverse of approved");
  assert.match(prompt, /August 12 versus August 21/);
  assert.match(prompt, /Approve only if all four criteria are met/);
});

test("malformed JSON retries once and then returns null", async () => {
  resetTrialAiRateLimits();
  let calls = 0;
  const result = await chatJson<{ ok: boolean }>(
    "system",
    "user",
    '{"ok":"boolean"}',
    {
      trialId: "malformed-json",
      transport: async () => {
        calls += 1;
        return response(calls === 1 ? "not json" : '{"wrong":"shape"}');
      },
      validate: (value): value is { ok: boolean } =>
        value !== null &&
        typeof value === "object" &&
        typeof (value as { ok?: unknown }).ok === "boolean",
    },
  );

  assert.equal(result, null);
  assert.equal(calls, 2);
});
