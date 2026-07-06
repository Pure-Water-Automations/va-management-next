import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVtt, cuesToTranscript, vttToMeetingMarkdown } from "../src/lib/zoom/vtt";
import { parseMeetingFile } from "../src/lib/meetings/extract";

const SAMPLE = `WEBVTT

1
00:00:01.000 --> 00:00:04.000
Justin Okamoto: Let's ship phase one first.

2
00:00:04.500 --> 00:00:07.000
Justin Okamoto: Then we revisit RTMS.

3
00:00:07.500 --> 00:00:10.000
Aira Mangila: I'll send the client the recap by Friday.
`;

test("parseVtt: extracts speaker + text from 'Name: text' cues", () => {
  const cues = parseVtt(SAMPLE);
  assert.equal(cues.length, 3);
  assert.deepEqual(cues[0], { speaker: "Justin Okamoto", text: "Let's ship phase one first." });
  assert.equal(cues[2].speaker, "Aira Mangila");
});

test("parseVtt: handles the <v Name>text</v> caption tag form", () => {
  const cues = parseVtt(`WEBVTT

1
00:00:00.000 --> 00:00:02.000
<v Kanna Saito>Uploading the report now.</v>
`);
  assert.deepEqual(cues, [{ speaker: "Kanna Saito", text: "Uploading the report now." }]);
});

test("cuesToTranscript: merges consecutive same-speaker cues into one line", () => {
  const transcript = cuesToTranscript(parseVtt(SAMPLE));
  const lines = transcript.split("\n");
  assert.equal(lines.length, 2); // Justin's two cues collapse into one line
  assert.equal(lines[0], "Justin Okamoto: Let's ship phase one first. Then we revisit RTMS.");
  assert.equal(lines[1], "Aira Mangila: I'll send the client the recap by Friday.");
});

test("vttToMeetingMarkdown: output round-trips through parseMeetingFile", () => {
  const md = vttToMeetingMarkdown(SAMPLE, {
    title: "NE Weekly Sync",
    zoomAccount: "host@example.com",
    date: new Date("2026-07-03T15:00:00.000Z"),
  });
  const meta = parseMeetingFile(md);
  assert.equal(meta.title, "NE Weekly Sync");
  assert.equal(meta.zoomAccount, "host@example.com");
  assert.equal(meta.date?.toISOString(), "2026-07-03T15:00:00.000Z");
  assert.match(meta.body, /Aira Mangila: I'll send the client the recap by Friday\./);
});

test("parseVtt: tolerates CRLF and skips NOTE/header blocks", () => {
  const cues = parseVtt("WEBVTT\r\n\r\nNOTE some metadata\r\n\r\n1\r\n00:00:00.000 --> 00:00:01.000\r\nBob: Hi.\r\n");
  assert.deepEqual(cues, [{ speaker: "Bob", text: "Hi." }]);
});
