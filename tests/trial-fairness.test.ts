import test from "node:test";
import assert from "node:assert/strict";

import { TRIAL_EVENTS } from "../src/lib/trial/events";
import { buildReviewerSummary } from "../src/lib/trial/ai/reviewer-summary";

const summaryTransport = async () => ({
  choices: [{ message: { content: '{"draftSummary":"- Candidate submitted check-ins on recorded days."}' } }],
});

test("reliability evidence after human escalation is excluded from scoring suggestions", async () => {
  const events = [
    {
      id: "escalated",
      timestamp: "2026-07-12T09:00:00.000Z",
      day: 1,
      type: TRIAL_EVENTS.HUMAN_ESCALATED,
      label: "Candidate requested a human",
    },
    ...Array.from({ length: 6 }, (_, index) => ({
      id: `checkin-${index}`,
      timestamp: `2026-07-${13 + index}T09:00:00.000Z`,
      day: index + 2,
      type: TRIAL_EVENTS.CHECKIN_SUBMITTED,
      label: `Check-in submitted on day ${index + 2}`,
    })),
  ];

  const result = await buildReviewerSummary({
    trial: { id: "trial-escalated", accommodationsActive: false },
    events,
    missions: [],
    messages: [],
    transport: summaryTransport,
  });

  assert.equal(result.aiSuggestedScores.rel, 3);
  assert.equal(result.competencyGroups.reliability.evidence.length, 0);
  assert.equal(result.competencyGroups.reliability.confidence, "Low");
});

test("active accommodations exclude latency and reliability evidence", async () => {
  const result = await buildReviewerSummary({
    trial: { id: "trial-accommodation", accommodationsActive: true },
    events: [
      {
        id: "reminder",
        timestamp: "2026-07-12T09:00:00.000Z",
        day: 1,
        type: TRIAL_EVENTS.CHECKIN_REMINDED,
        label: "Check-in reminder sent",
      },
      {
        id: "timeout",
        timestamp: "2026-07-13T09:00:00.000Z",
        day: 2,
        type: TRIAL_EVENTS.STEP_TIMED_OUT,
        label: "Timer automatically paused",
      },
    ],
    missions: [],
    messages: [],
    transport: summaryTransport,
  });

  assert.equal(result.aiSuggestedScores.rel, 3);
  assert.equal(result.competencyGroups.reliability.evidence.length, 0);
  // Only latency/reliability is paused; the timeout remains usable as ownership context.
  assert.notEqual(
    result.competencyGroups.ownership.evidence[0]?.excludedFromScoring,
    true,
  );
});
