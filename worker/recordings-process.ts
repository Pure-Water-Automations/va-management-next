/**
 * recordings-process — best-effort AI post-processing for uploaded recordings.
 * Polls for recordings with aiStatus="pending" (set at finalize), pulls the video
 * from R2, extracts a compact audio track with ffmpeg, then sends it to a cheap
 * OpenRouter multimodal model (default google/gemini-2.5-flash-lite) which returns
 * a timestamped transcript + title + summary in one call. Writes the results back.
 *
 * Never blocks playback: a recording is already "ready" before this runs; failures
 * just mark aiStatus and move on. Run on a short cron (every 1-2 min) or on demand:
 * `npm run worker:recordings`. Requires ffmpeg on the host.
 */
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { r2Configured, r2GetObject, r2Put, transcriptKey } from "@/lib/r2";
import { transcribeAudio } from "@/lib/recordings/transcription";
import { extractAudioMp3, ffmpegAvailable } from "./lib/media";

const BATCH = 3;
// A claimed row that's still "running" after this long is treated as a crashed
// attempt and re-queued (the previous worker died mid-process).
const STALE_RUNNING_MS = 15 * 60 * 1000;

async function processOne(rec: {
  id: string;
  objectKey: string;
  mimeType: string;
  title: string;
}): Promise<void> {
  // Row is already claimed (aiStatus="running") by the atomic claim in main().
  if (!env.OPENROUTER_API_KEY) {
    await db.recording.update({ where: { id: rec.id }, data: { aiStatus: "skipped" } });
    return;
  }

  try {
    const bytes = await r2GetObject(rec.objectKey);
    const ext = rec.mimeType.includes("mp4") ? "mp4" : "webm";
    const mp3 = await extractAudioMp3(bytes, ext);
    const result = await transcribeAudio(mp3, "mp3");

    if (!result) {
      // No intelligible speech / model returned nothing usable — done, not failed.
      await db.recording.update({ where: { id: rec.id }, data: { aiStatus: "done" } });
      return;
    }

    const tKey = transcriptKey(rec.id);
    await r2Put(tKey, JSON.stringify(result.segments), "application/json").catch(() => undefined);

    await db.recording.update({
      where: { id: rec.id },
      data: {
        transcript: result.text || null,
        transcriptJson: result.segments.length ? result.segments : undefined,
        transcriptKey: tKey,
        aiTitle: result.title,
        aiSummary: result.summary,
        aiStatus: "done",
        ...(result.title && rec.title === "Untitled recording" ? { title: result.title } : {}),
      },
    });
  } catch (err) {
    console.error(`  ${rec.id}: ${String(err).split("\n")[0]}`);
    await db.recording
      .update({ where: { id: rec.id }, data: { aiStatus: "failed" } })
      .catch(() => undefined);
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

    // Transcription needs ffmpeg. If it's missing, leave rows pending (don't burn
    // them) so they process once ffmpeg is installed.
    if (env.OPENROUTER_API_KEY && !(await ffmpegAvailable())) {
      await db.syncRun.update({
        where: { id: run.id },
        data: {
          status: "SUCCESS",
          finishedAt: new Date(),
          firstErrorLine: "ffmpeg not installed — skipped",
          detailsJson: { skipped: true, reason: "no-ffmpeg" },
        },
      });
      console.log("recordings-process: skipped (ffmpeg not installed — `apt install -y ffmpeg`)");
      return;
    }

    // Re-queue rows wedged in "running" from a crashed earlier attempt.
    const reclaimed = await db.recording.updateMany({
      where: { aiStatus: "running", updatedAt: { lt: new Date(Date.now() - STALE_RUNNING_MS) } },
      data: { aiStatus: "pending" },
    });

    const pending = await db.recording.findMany({
      where: { status: "ready", aiStatus: "pending" },
      orderBy: { createdAt: "asc" },
      take: BATCH,
      select: { id: true, objectKey: true, mimeType: true, title: true },
    });

    let processed = 0;
    for (const rec of pending) {
      // Atomic claim: only one worker can flip pending→running for this row.
      const claim = await db.recording.updateMany({
        where: { id: rec.id, aiStatus: "pending" },
        data: { aiStatus: "running" },
      });
      if (claim.count !== 1) continue; // another worker grabbed it first
      await processOne(rec);
      processed += 1;
    }

    await db.syncRun.update({
      where: { id: run.id },
      data: {
        status: "SUCCESS",
        finishedAt: new Date(),
        detailsJson: { processed, reclaimed: reclaimed.count },
      },
    });
    console.log(`recordings-process: processed ${processed} (reclaimed ${reclaimed.count})`);
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
