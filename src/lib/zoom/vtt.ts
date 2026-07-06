/**
 * Convert a Zoom recording TRANSCRIPT (WebVTT) into the SAME Markdown shape the VPS
 * Meetings/*.md harvester writes, so it flows through the identical extraction
 * (src/lib/meetings/extract.ts parseMeetingFile → buildExtractionMessages). Pure —
 * no DB/network — unit-tested in tests/zoom-vtt.test.ts.
 *
 * Zoom VTT cues look like:
 *   1
 *   00:00:03.120 --> 00:00:05.400
 *   Justin Okamoto: Let's ship phase one first.
 * Some exports wrap the speaker as <v Name>text</v>. We handle both.
 */

export type VttCue = { speaker: string | null; text: string };

const SPEAKER_TAG = /^<v\s+([^>]+)>([\s\S]*?)<\/v>\s*$/i;
const SPEAKER_PREFIX = /^([^:]{1,60}):\s+([\s\S]*)$/;

/** Parse WebVTT into ordered { speaker, text } cues. Robust to CRLF, NOTE blocks, cue ids. */
export function parseVtt(vtt: string): VttCue[] {
  const clean = String(vtt || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/^﻿/, "");
  const blocks = clean.split(/\n\s*\n/);
  const cues: VttCue[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines[0].toUpperCase().startsWith("WEBVTT")) continue;
    if (lines[0].toUpperCase().startsWith("NOTE")) continue;

    const tsIdx = lines.findIndex((l) => l.includes("-->"));
    if (tsIdx === -1) continue; // not a cue (e.g. a stray header)

    const textLines = lines.slice(tsIdx + 1);
    if (!textLines.length) continue;
    let text = textLines.join(" ").trim();
    if (!text) continue;

    let speaker: string | null = null;
    const tag = text.match(SPEAKER_TAG);
    if (tag) {
      speaker = tag[1].trim();
      text = tag[2].trim();
    } else {
      const pref = text.match(SPEAKER_PREFIX);
      if (pref) {
        speaker = pref[1].trim();
        text = pref[2].trim();
      }
    }
    if (text) cues.push({ speaker, text });
  }
  return cues;
}

/** Collapse consecutive cues from the same speaker into one "Speaker: …" line. */
export function cuesToTranscript(cues: VttCue[]): string {
  const out: string[] = [];
  let curSpeaker: string | null | undefined;
  let buf: string[] = [];
  const flush = () => {
    if (!buf.length) return;
    const body = buf.join(" ");
    out.push(curSpeaker ? `${curSpeaker}: ${body}` : body);
    buf = [];
  };
  for (const c of cues) {
    if (c.speaker !== curSpeaker) {
      flush();
      curSpeaker = c.speaker;
    }
    buf.push(c.text);
  }
  flush();
  return out.join("\n");
}

export type VttMeetingMeta = {
  title: string;
  zoomAccount: string | null; // installed account label (e.g. the host email)
  date: Date | null; // recording start
};

const oneLine = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/**
 * Render a full Meetings/*.md document (flat YAML frontmatter + speaker-attributed
 * body) from a Zoom VTT transcript.
 */
export function vttToMeetingMarkdown(vtt: string, meta: VttMeetingMeta): string {
  const transcript = cuesToTranscript(parseVtt(vtt));
  const fm: string[] = ["---"];
  fm.push(`title: "${oneLine(meta.title || "Zoom meeting").replace(/"/g, "'")}"`);
  if (meta.zoomAccount) fm.push(`zoom_account: "${oneLine(meta.zoomAccount).replace(/"/g, "'")}"`);
  if (meta.date && !isNaN(meta.date.getTime())) fm.push(`recording_start: ${meta.date.toISOString()}`);
  fm.push("source: zoom_app_recording");
  fm.push("---");
  return `${fm.join("\n")}\n\n${transcript}\n`;
}
