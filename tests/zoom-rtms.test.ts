import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRtmsEvent, type ZoomWebhookEvent } from "../src/lib/zoom/webhook";
import {
  buildLiveMessages,
  contextTail,
  isDuplicateTitle,
  LIVE_CLASSIFY_DEFAULTS,
  NEW_TRANSCRIPT_MARKER,
  parseLiveItems,
  shouldClassify,
  takeWindow,
  titleKey,
  unclassifiedChars,
  type LiveSegment,
} from "../src/lib/zoom/live-classify";

// ── parseRtmsEvent ───────────────────────────────────────────────────────────

const startedFlat = {
  event: "meeting.rtms_started",
  event_ts: 1751800000000,
  payload: {
    meeting_uuid: "abc==",
    rtms_stream_id: "stream-1",
    server_urls: "wss://rtms.zoom.us/x",
    operator_id: "op-9",
  },
} as unknown as ZoomWebhookEvent;

test("parseRtmsEvent: flat payload fields", () => {
  const info = parseRtmsEvent(startedFlat);
  assert.ok(info);
  assert.equal(info.meetingUuid, "abc==");
  assert.equal(info.streamId, "stream-1");
  assert.equal(info.serverUrls, "wss://rtms.zoom.us/x");
  assert.equal(info.operatorId, "op-9");
  assert.equal(info.eventTs, 1751800000000);
});

test("parseRtmsEvent: object-nested payload fields", () => {
  const nested = {
    event: "meeting.rtms_started",
    payload: { object: { meeting_uuid: "m1", rtms_stream_id: "s1", server_urls: "wss://a" } },
  } as unknown as ZoomWebhookEvent;
  const info = parseRtmsEvent(nested);
  assert.ok(info);
  assert.equal(info.meetingUuid, "m1");
  assert.equal(info.streamId, "s1");
  assert.equal(info.eventTs, null);
});

test("parseRtmsEvent: null without a meeting uuid", () => {
  const bad = { event: "meeting.rtms_started", payload: { rtms_stream_id: "s" } } as unknown as ZoomWebhookEvent;
  assert.equal(parseRtmsEvent(bad), null);
});

// ── shouldClassify ───────────────────────────────────────────────────────────

test("shouldClassify: nothing unclassified → never", () => {
  assert.equal(
    shouldClassify({ unclassifiedChars: 0, msSinceLastClassify: Infinity, sessionEnding: true }),
    false,
  );
});

test("shouldClassify: session ending flushes any remainder", () => {
  assert.equal(shouldClassify({ unclassifiedChars: 5, msSinceLastClassify: 0, sessionEnding: true }), true);
});

test("shouldClassify: big backlog fires immediately, small waits for debounce", () => {
  assert.equal(
    shouldClassify({
      unclassifiedChars: LIVE_CLASSIFY_DEFAULTS.maxChars,
      msSinceLastClassify: 0,
      sessionEnding: false,
    }),
    true,
  );
  assert.equal(
    shouldClassify({ unclassifiedChars: 400, msSinceLastClassify: 1000, sessionEnding: false }),
    false,
  );
  assert.equal(
    shouldClassify({
      unclassifiedChars: 400,
      msSinceLastClassify: LIVE_CLASSIFY_DEFAULTS.debounceMs,
      sessionEnding: false,
    }),
    true,
  );
});

// ── window building ──────────────────────────────────────────────────────────

const seg = (speaker: string, text: string, roleLabel = "va"): LiveSegment => ({
  ts: 1,
  speaker,
  roleLabel,
  text,
});

test("takeWindow: respects maxChars but always takes at least one segment", () => {
  const segments = [seg("A", "x".repeat(50)), seg("B", "y".repeat(50)), seg("C", "z".repeat(50))];
  const w = takeWindow(segments, 0, 70);
  assert.equal(w.nextIdx, 1); // second segment would exceed the cap
  assert.ok(w.text.includes("[va] A:"));
  const whole = takeWindow(segments, 0, 10_000);
  assert.equal(whole.nextIdx, 3);
  // A window always advances even when a single segment exceeds the cap.
  const giant = takeWindow([seg("A", "q".repeat(500))], 0, 100);
  assert.equal(giant.nextIdx, 1);
});

test("contextTail + unclassifiedChars: consistent formatting", () => {
  const segments = [seg("A", "hello there"), seg("B", "general kenobi")];
  const tail = contextTail(segments, 2, 1000);
  assert.ok(tail.includes("[va] A: hello there"));
  assert.ok(unclassifiedChars(segments, 0) > 0);
  assert.equal(unclassifiedChars(segments, 2), 0);
});

test("buildLiveMessages: marker separates context from new transcript", () => {
  const msgs = buildLiveMessages({
    meetingTitle: "Weekly sync",
    dateIso: "2026-07-06T15:00:00.000Z",
    rosterLines: ["[client] Dan (unmatched)"],
    alreadyProposed: ["Send the payroll CSV"],
    contextText: "[va] Aira: earlier context",
    windowText: "[client] Dan: please send me the report tomorrow",
  });
  assert.equal(msgs.length, 2);
  const user = msgs[1].content;
  assert.ok(user.includes("MEETING: Weekly sync"));
  assert.ok(user.includes("- Send the payroll CSV"));
  const markerIdx = user.indexOf(NEW_TRANSCRIPT_MARKER);
  assert.ok(markerIdx > -1);
  assert.ok(user.indexOf("earlier context") < markerIdx);
  assert.ok(user.indexOf("send me the report") > markerIdx);
});

// ── parseLiveItems ───────────────────────────────────────────────────────────

test("parseLiveItems: valid items parse; confidence clamped; bad kinds dropped", () => {
  const out = parseLiveItems(
    JSON.stringify([
      {
        kind: "task",
        title: "Send Dan the Q3 report",
        confidence: 0.9,
        evidenceQuote: "I'll send you the Q3 report tomorrow",
        suggestedDueDate: "2026-07-07",
      },
      { kind: "project", title: "Rebuild the onboarding flow", confidence: 7 },
      { kind: "in_meeting", title: "Share the screen", confidence: 0.9 },
      { kind: "task", title: "", confidence: 0.9 },
    ]),
  );
  assert.ok(out);
  assert.equal(out.length, 2);
  assert.equal(out[0].kind, "task");
  assert.equal(out[0].suggestedDueDate, "2026-07-07");
  assert.equal(out[1].confidence, 1); // clamped
});

test("parseLiveItems: fenced output and prose-wrapped arrays still parse", () => {
  const fenced = "```json\n[{\"kind\":\"task\",\"title\":\"Do the thing\",\"confidence\":0.8}]\n```";
  assert.equal(parseLiveItems(fenced)?.length, 1);
  const wrapped = 'Here you go: [{"kind":"task","title":"Do it","confidence":0.6}] hope that helps';
  assert.equal(parseLiveItems(wrapped)?.length, 1);
});

test("parseLiveItems: unparseable → null; empty array → []", () => {
  assert.equal(parseLiveItems("no json here"), null);
  assert.deepEqual(parseLiveItems("[]"), []);
  assert.equal(parseLiveItems('{"kind":"task"}'), null); // not an array
});

test("parseLiveItems: missing confidence defaults to 0.5", () => {
  const out = parseLiveItems('[{"kind":"task","title":"Follow up with the vendor"}]');
  assert.equal(out?.[0].confidence, 0.5);
});

// ── title dedup ──────────────────────────────────────────────────────────────

test("titleKey/isDuplicateTitle: exact + containment dedup, short titles safe", () => {
  assert.equal(titleKey("Send the Payroll CSV!"), "send the payroll csv");
  assert.equal(isDuplicateTitle("Send the payroll CSV", ["send the payroll csv"]), true);
  assert.equal(isDuplicateTitle("Send the payroll CSV to Dan", ["Send the payroll CSV"]), true);
  // Short generic titles must NOT collapse into each other via containment.
  assert.equal(isDuplicateTitle("Email Dan", ["Email Daniela the contract"]), false);
  assert.equal(isDuplicateTitle("Prepare the July newsletter", ["Send the payroll CSV"]), false);
});
