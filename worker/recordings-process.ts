/**
 * recordings-process — best-effort AI post-processing for uploaded recordings.
 * Polls for recordings with aiStatus="pending" (set at finalize), pulls the audio
 * from R2, runs OpenAI speech-to-text for a transcript, then a chat completion for
 * a title + summary, and writes the results back. Never blocks playback: a recording
 * is already "ready" before this runs; failures just mark aiStatus and move on.
 * Run on a short cron (every 1–2 min) or on demand: `npm run worker:recordings`.
 */
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { r2Configured, r2GetObject, r2Put, transcriptKey } from "@/lib/r2";

const BATCH = 3;

type Segment = { start: number; end: number; text: string };

async function transcribe(
  bytes: Uint8Array,
  mimeType: string,
): Promise<{ text: string; segments: Segment[] } | null> {
  if (!env.OPENAI_API_KEY) return null;
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const fd = new FormData();
  // Copy into a plain ArrayBuffer so the Blob part type is unambiguous.
  const ab = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(ab).set(bytes);
  fd.append("file", new Blob([ab], { type: mimeType }), `audio.${ext}`);
  fd.append("model", env.OPENAI_TRANSCRIBE_MODEL);
  fd.append("response_format", "verbose_json");

  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`transcribe ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    text?: string;
    segments?: { start: number; end: number; text: string }[];
  };
  return {
    text: (data.text ?? "").trim(),
    segments: (data.segments ?? []).map((s) => ({ start: s.start, end: s.end, text: s.text.trim() })),
  };
}

async function summarize(transcript: string): Promise<{ title: string; summary: string } | null> {
  if (!env.OPENAI_API_KEY || !transcript) return null;
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.OPENAI_API_KEY}` },
    body: JSON.stringify({
      model: env.OPENAI_MODEL,
      temperature: 0.3,
      max_tokens: 250,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            'You summarize a screen-recording transcript from a virtual assistant\'s work log. Return ONLY JSON: {"title":"concise title, <=8 words","summary":"2-4 sentence summary of what was shown/done"}.',
        },
        { role: "user", content: transcript.slice(0, 8000) },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as { title?: string; summary?: string };
    return { title: (p.title ?? "").trim(), summary: (p.summary ?? "").trim() };
  } catch {
    return null;
  }
}

async function processOne(rec: {
  id: string;
  objectKey: string;
  mimeType: string;
  title: string;
}): Promise<void> {
  await db.recording.update({ where: { id: rec.id }, data: { aiStatus: "running" } });

  if (!env.OPENAI_API_KEY) {
    await db.recording.update({ where: { id: rec.id }, data: { aiStatus: "skipped" } });
    return;
  }

  try {
    const bytes = await r2GetObject(rec.objectKey);
    const tr = await transcribe(bytes, rec.mimeType);
    if (!tr) {
      await db.recording.update({ where: { id: rec.id }, data: { aiStatus: "failed" } });
      return;
    }

    const tKey = transcriptKey(rec.id);
    await r2Put(tKey, JSON.stringify(tr.segments), "application/json").catch(() => undefined);
    const ai = await summarize(tr.text).catch(() => null);

    await db.recording.update({
      where: { id: rec.id },
      data: {
        transcript: tr.text || null,
        transcriptJson: tr.segments.length ? tr.segments : undefined,
        transcriptKey: tKey,
        aiTitle: ai?.title || null,
        aiSummary: ai?.summary || null,
        aiStatus: "done",
        ...(ai?.title && rec.title === "Untitled recording" ? { title: ai.title } : {}),
      },
    });
  } catch (err) {
    console.error(`  ${rec.id}: ${String(err).split("\n")[0]}`);
    await db.recording.update({ where: { id: rec.id }, data: { aiStatus: "failed" } }).catch(() => undefined);
  }
}

async function main() {
  const run = await db.syncRun.create({ data: { worker: "recordings-process", status: "FAILED" } });
  try {
    if (!r2Configured()) {
      await db.syncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          firstErrorLine: "R2 not configured — skipped",
          detailsJson: { skipped: true },
        },
      });
      console.log("recordings-process: skipped (R2 not configured)");
      return;
    }

    const pending = await db.recording.findMany({
      where: { status: "ready", aiStatus: "pending" },
      orderBy: { createdAt: "asc" },
      take: BATCH,
      select: { id: true, objectKey: true, mimeType: true, title: true },
    });

    for (const rec of pending) await processOne(rec);

    await db.syncRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), detailsJson: { processed: pending.length } },
    });
    console.log(`recordings-process: processed ${pending.length}`);
  } catch (err) {
    await db.syncRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), firstErrorLine: String(err).split("\n")[0] },
    });
    throw err;
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(`recordings-process failed: ${e instanceof Error ? e.message : e}`);
    await db.$disconnect();
    process.exit(1);
  });
