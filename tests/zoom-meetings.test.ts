import test from "node:test";
import assert from "node:assert/strict";

import { buildMeetingBody, parseMeeting } from "../src/lib/zoom/meetings";

test("buildMeetingBody builds a scheduled discovery meeting", () => {
  assert.deepEqual(
    buildMeetingBody({
      topic: "Discovery call — Pure Water Automations × Riverside",
      startIso: "2026-07-20T14:00:00.000Z",
      durationMin: 30,
      timezone: "America/New_York",
    }),
    {
      topic: "Discovery call — Pure Water Automations × Riverside",
      type: 2,
      start_time: "2026-07-20T14:00:00.000Z",
      duration: 30,
      timezone: "America/New_York",
      settings: { join_before_host: true, waiting_room: false },
    },
  );
});

test("parseMeeting extracts the meeting id and join URL", () => {
  assert.deepEqual(
    parseMeeting({ id: 987654321, join_url: "https://zoom.us/j/987654321" }),
    { id: "987654321", joinUrl: "https://zoom.us/j/987654321" },
  );
});

test("parseMeeting throws when join_url is missing", () => {
  assert.throws(() => parseMeeting({ id: 987654321 }), /join_url/);
});
